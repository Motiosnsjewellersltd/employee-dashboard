import { parseActivity } from "@/lib/quizActivity";
import { questionNotificationWhere, quizAudienceAllows } from "@/lib/dailyQuizReport";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendPushToEmployees } from "@/lib/webPush";
import { DAILY_QUIZ_KEY, DAILY_QUIZ_LAST_RUN, quizEligibleEmployee, selectedQuizIds, parseQuizSettings, quizIndiaTime, quizNotificationSlot, type QuizSettings } from "@/lib/dailyQuizRules";
export type QuizDb = Prisma.TransactionClient;
export async function quizLock(db: QuizDb) {
  // Keep the transaction lock, but return a supported integer rather than PostgreSQL void.
  await db.$queryRaw(Prisma.sql`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(649102601)`);
}
export async function quizCandidates(db: QuizDb = prisma) {
  const rows = await db.employee.findMany({ where: { role: "EMPLOYEE", status: "ACTIVE", deletedAt: null, exitDate: null }, select: { id: true, name: true, role: true, employeeCode: true, branch: true, department: true, designation: true, status: true, deletedAt: true, exitDate: true }, orderBy: [{ department: "asc" }, { name: "asc" }] });
  return rows.filter(quizEligibleEmployee);
}
export async function quizAccess(db: QuizDb = prisma) {
  const [row, candidates] = await Promise.all([db.permissionSetting.findUnique({ where: { key: DAILY_QUIZ_KEY } }), quizCandidates(db)]);
  const settings = parseQuizSettings(row?.value), ids = new Set(selectedQuizIds(settings));
  const targets = candidates.filter(person => ids.has(person.id));
  return { settings, candidates, targets, target: targets[0] || null };
}

export function publicQuizQuestion(question: { id: string; date: string; updatedAt: Date; question: string; options: Prisma.JsonValue; correctIndex: number; explanation: string; activity?: Prisma.JsonValue }, answer: { selectedIndex: number; isCorrect: boolean; answeredAt: Date; gameResult?: Prisma.JsonValue } | null, today: string) {
  const activity = parseActivity(question.activity);
  const activityView = activity?.type === "game" ? { type: "game", gameId: activity.definition.id, title: activity.definition.title, icon: activity.definition.icon } : activity;
  return { activity: activityView, ...(answer?.gameResult ? { gameResult: answer.gameResult } : {}), id: question.id, date: question.date, version: question.updatedAt.toISOString(), question: question.question, options: question.options, canAnswer: question.date === today && !answer, answer: answer ? { selectedIndex: answer.selectedIndex, isCorrect: answer.isCorrect, answeredAt: answer.answeredAt } : null, ...(answer || question.date < today ? { correctIndex: question.correctIndex, explanation: question.explanation } : {}) };
}
export async function runDailyQuizNotifications({ now = new Date(), manual = false, questionId = "" }: { now?: Date; manual?: boolean; questionId?: string } = {}) {
  let intervalMinutes = 0, keepChecking = false;
  const result = await prisma.$transaction(async tx => {
    await quizLock(tx);
    const { settings, targets } = await quizAccess(tx);
    intervalMinutes = settings.intervalMinutes;
    if (!settings.enabled || !settings.notificationsEnabled) return { sent: 0, started: false, reason: "Quiz or notifications are paused." };
    if (!targets.length) return { sent: 0, started: false, reason: "No eligible employees are selected." };
    const current = quizIndiaTime(now), scheduled = quizNotificationSlot(settings, now);
    const question = await tx.dailyQuizQuestion.findUnique({ where: manual ? { id: questionId } : { date: current.date } });
    if (!question?.isPublished) return { sent: 0, started: false, reason: "A published question is required." };
    if (question.date < current.date) return { sent: 0, started: false, reason: "Notifications cannot start for a past question." };
    const audience = targets.filter(person => quizAudienceAllows(question.audience, person.id));
    if (!audience.length) return { sent: 0, started: false, reason: "The selected employees are not in this question audience." };
    const answers = await tx.dailyQuizAnswer.findMany({ where: { questionId: question.id }, select: { employeeId: true } });
    const answered = new Set(answers.map(answer => answer.employeeId));
    const unanswered = audience.filter(person => !answered.has(person.id));
    if (!unanswered.length) return { sent: 0, started: Boolean(question.notificationsStartedAt), reason: "This question is already answered; reminders stopped." };
    if (manual && question.notificationsStartedAt) return { sent: 0, started: true, reason: "Notifications are already started for this question." };
    if (!manual && !question.notificationsStartedAt) return { sent: 0, started: false, reason: "Waiting for Admin to click Send / Check Now on this question." };
    if (!manual && !scheduled) return { sent: 0, started: true, reason: "Outside notification hours (IST)." };
    if (manual && question.date > current.date) {
      await tx.dailyQuizQuestion.update({ where: { id: question.id }, data: { notificationsStartedAt: now, updatedAt: question.updatedAt } });
      return { sent: 0, started: true, reason: `Notifications enabled for ${question.date}; first check runs on that date during the configured hours.` };
    }
    keepChecking = question.date === current.date && Boolean(scheduled);
    const notices = await tx.notificationBlast.findMany({ where: questionNotificationWhere(question.id, question.date), orderBy: { createdAt: "desc" }, select: { createdAt: true, recipients: { select: { employeeId: true } } } });
    const latest = new Map<string, Date>();
    for (const notice of notices) for (const recipient of notice.recipients) if (!latest.has(recipient.employeeId)) latest.set(recipient.employeeId, notice.createdAt);
    const due = unanswered.filter(person => { const last = latest.get(person.id); return manual ? !last : !last || now.getTime() - last.getTime() >= settings.intervalMinutes * 60000; });
    if (!due.length) {
      if (manual) await tx.dailyQuizQuestion.update({ where: { id: question.id }, data: { notificationsStartedAt: now, updatedAt: question.updatedAt } });
      return { sent: 0, started: true, reason: manual ? "An existing notification was found; future reminders are now enabled." : "Notification gap has not elapsed." };
    }
    const targetIds = due.map(person => person.id).sort();
    // Use the actual latest ledger state: minute tests and gap changes must not collide
    // with an earlier reminder in the same half-hour. The transaction lock serializes scans.
    const bucket = Math.floor(now.getTime() / (settings.intervalMinutes * 60000));
    const previous = targetIds.map(id => `${id}:${latest.get(id)?.getTime() || 0}`).join(",");
    const id = "daily-quiz-" + createHash("sha256").update(manual ? `first:${question.id}:${targetIds.join(",")}` : `${question.id}:${previous}:${bucket}`).digest("hex");
    if (await tx.notificationBlast.findUnique({ where: { id }, select: { id: true } })) return { sent: 0, started: true, reason: "This notification is already recorded." };
    const index = manual || !latest.size ? 0 : scheduled ? scheduled.slot % settings.messages.length : bucket % settings.messages.length;
    const isGame = parseActivity(question.activity)?.type === "game";
    const text = isGame ? settings.messages[index].replace(/सवाल/g, "game").replace(/question|quiz/gi, "game") : settings.messages[index];
    await tx.notificationBlast.create({ data: { id, type: "NOTICE", text, filterType: "SYSTEM", filterValue: `DAILY_JEWELLERY_QUIZ:${question.date}:${question.id}`, createdById: question.createdById, createdAt: now, recipients: { create: targetIds.map(employeeId => ({ employeeId, clearedAt: now })) } } });
    if (manual) await tx.dailyQuizQuestion.update({ where: { id: question.id }, data: { notificationsStartedAt: now, updatedAt: question.updatedAt } });
    return { sent: targetIds.length, started: true, reason: `Quiz notifications prepared for ${targetIds.length} selected employee(s). Future reminders are enabled.`, id, targetIds, text, date: question.date, questionId: question.id, isGame };
  });
  let pushError = false, pushStatus: string | null = null;
  if ("id" in result && result.id && result.targetIds && result.text) {
    // Recheck current selection/roles before transport, including a concurrent Admin deselection.
    const access = await quizAccess();
    const permitted = new Set(access.settings.enabled && access.settings.notificationsEnabled ? access.targets.map(person => person.id) : []);
    const answered = await prisma.dailyQuizAnswer.findMany({ where: { questionId: result.questionId }, select: { employeeId: true } });
    const answeredIds = new Set(answered.map(person => person.employeeId));
    const activeQuestion = await prisma.dailyQuizQuestion.findUnique({ where: { id: result.questionId } });
    const ids = result.targetIds.filter(id => activeQuestion?.isPublished && activeQuestion.date === quizIndiaTime(now).date && activeQuestion.date === result.date && quizAudienceAllows(activeQuestion.audience, id) && permitted.has(id) && !answeredIds.has(id));
    if (ids.length) await sendPushToEmployees(ids, { title: result.isGame ? "🎮 आज का Jewellery Game" : "💎 आज का Jewellery सवाल", body: result.text, url: `/?section=dailyQuiz&quizDate=${result.date}`, tag: result.id }, result.id, { expiresAt: Date.parse(`${result.date}T00:00:00Z`) + 86400000 - 330 * 60000 }).catch(() => { pushError = true; });
    if (ids.length === 1) {
      try { pushStatus = (await prisma.messageRecipient.findUnique({ where: { blastId_employeeId: { blastId: result.id, employeeId: ids[0] } }, select: { pushStatus: true } }))?.pushStatus || null; }
      catch { /* Transport status does not prove phone delivery. */ }
    }
  }
  const phoneDetail = result.sent ? pushStatus === "ACCEPTED" ? " Push service accepted the phone notification." : pushStatus === "NO_SUBSCRIPTION" ? " Phone push has no active subscription; allow notifications on the employee device." : pushStatus === "NOT_CONFIGURED" ? " Phone push is not configured." : pushStatus === "FAILED" || pushError ? " Phone push failed; delivery tracking is saved." : " Phone delivery is not confirmed." : "";
  const status = { checkedAt: now.toISOString(), sent: result.sent, started: result.started, reason: result.reason + phoneDetail, pushError, pushStatus, intervalMinutes, checkAgainInSeconds: keepChecking ? 60 : null };
  // Preserve the last actual send when a later minute check only reports "gap not elapsed".
  let lastNotification = null;
  try {
    const previous = await prisma.permissionSetting.findUnique({ where: { key: DAILY_QUIZ_LAST_RUN } });
    lastNotification = JSON.parse(previous?.value || "null")?.lastNotification || null;
  } catch { /* Diagnostics must not stop notifications. */ }
  if (result.sent) lastNotification = { checkedAt: status.checkedAt, sent: result.sent, reason: status.reason, pushStatus, pushError };
  const savedStatus = { ...status, lastNotification };
  await prisma.permissionSetting.upsert({ where: { key: DAILY_QUIZ_LAST_RUN }, create: { key: DAILY_QUIZ_LAST_RUN, value: JSON.stringify(savedStatus) }, update: { value: JSON.stringify(savedStatus) } }).catch(() => null);
  return status;
}
