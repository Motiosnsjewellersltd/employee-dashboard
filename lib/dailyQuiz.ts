import { questionNotificationWhere, quizAudienceAllows } from "@/lib/dailyQuizReport";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { sendPushToEmployees } from "@/lib/webPush";
import { DAILY_QUIZ_KEY, DAILY_QUIZ_LAST_RUN, isQuizPreviewName, parseQuizSettings, quizIndiaTime, quizNotificationSlot, type QuizSettings } from "@/lib/dailyQuizRules";
export type QuizDb = Prisma.TransactionClient;
export async function quizLock(db: QuizDb) {
  // Keep the transaction lock, but return a supported integer rather than PostgreSQL void.
  await db.$queryRaw(Prisma.sql`SELECT 1 AS "locked" FROM pg_advisory_xact_lock(649102601)`);
}
export async function quizCandidates(db: QuizDb = prisma) {
  const rows = await db.employee.findMany({ where: { role: "EMPLOYEE", status: "ACTIVE", deletedAt: null, exitDate: null, name: { contains: "ghanshyam", mode: "insensitive" } }, select: { id: true, name: true, role: true, employeeCode: true, branch: true, status: true, deletedAt: true, exitDate: true }, take: 50 });
  return rows.filter(row => row.role === "EMPLOYEE" && row.status === "ACTIVE" && !row.deletedAt && !row.exitDate && isQuizPreviewName(row.name));
}
export async function quizAccess(db: QuizDb = prisma) {
  const [row, candidates] = await Promise.all([db.permissionSetting.findUnique({ where: { key: DAILY_QUIZ_KEY } }), quizCandidates(db)]);
  const settings = parseQuizSettings(row?.value);
  // Never substitute another employee if a stored target disappears or changes role/name.
  const target = settings.targetEmployeeId ? candidates.find(person => person.id === settings.targetEmployeeId) || null : candidates.length === 1 ? candidates[0] : null;
  return { settings, candidates, target };
}
export function publicQuizQuestion(question: { id: string; date: string; updatedAt: Date; question: string; options: Prisma.JsonValue; correctIndex: number; explanation: string }, answer: { selectedIndex: number; isCorrect: boolean; answeredAt: Date } | null, today: string) {
  return { id: question.id, date: question.date, version: question.updatedAt.toISOString(), question: question.question, options: question.options, canAnswer: question.date === today && !answer, answer: answer ? { selectedIndex: answer.selectedIndex, isCorrect: answer.isCorrect, answeredAt: answer.answeredAt } : null, ...(answer || question.date < today ? { correctIndex: question.correctIndex, explanation: question.explanation } : {}) };
}
export async function runDailyQuizNotifications({ now = new Date(), manual = false, questionId = "" }: { now?: Date; manual?: boolean; questionId?: string } = {}) {
  const result = await prisma.$transaction(async tx => {
    await quizLock(tx);
    const { settings, target } = await quizAccess(tx);
    if (!settings.enabled || !settings.notificationsEnabled) return { sent: 0, started: false, reason: "Quiz or notifications are paused." };
    if (!settings.targetEmployeeId || !target) return { sent: 0, started: false, reason: "No eligible Ghanshyam Jangir profile is selected." };
    const current = quizIndiaTime(now), scheduled = quizNotificationSlot(settings, now);
    const question = await tx.dailyQuizQuestion.findUnique({ where: manual ? { id: questionId } : { date: current.date } });
    if (!question?.isPublished) return { sent: 0, started: false, reason: "A published question is required." };
    if (question.date < current.date) return { sent: 0, started: false, reason: "Notifications cannot start for a past question." };
    if (!quizAudienceAllows(question.audience, target.id)) return { sent: 0, started: false, reason: "The selected employee is not in this question audience." };
    const answer = await tx.dailyQuizAnswer.findUnique({ where: { questionId_employeeId: { questionId: question.id, employeeId: target.id } } });
    if (answer) return { sent: 0, started: Boolean(question.notificationsStartedAt), reason: "This question is already answered; reminders stopped." };
    if (manual && question.notificationsStartedAt) return { sent: 0, started: true, reason: "Notifications are already started for this question." };
    if (!manual && !question.notificationsStartedAt) return { sent: 0, started: false, reason: "Waiting for Admin to click Send / Check Now on this question." };
    if (!manual && !scheduled) return { sent: 0, started: true, reason: "Outside notification hours (IST)." };
    if (manual && question.date > current.date) {
      await tx.dailyQuizQuestion.update({ where: { id: question.id }, data: { notificationsStartedAt: now, updatedAt: question.updatedAt } });
      return { sent: 0, started: true, reason: `Notifications enabled for ${question.date}; first check runs on that date during the configured hours.` };
    }
    const latest = await tx.notificationBlast.findFirst({ where: { ...questionNotificationWhere(question.id, question.date), recipients: { some: { employeeId: target.id } } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    if (manual && latest) {
      // A notice saved by the old deployment is already the first send. Do not duplicate it.
      await tx.dailyQuizQuestion.update({ where: { id: question.id }, data: { notificationsStartedAt: latest.createdAt, updatedAt: question.updatedAt } });
      return { sent: 0, started: true, reason: "An existing notification was found; future reminders are now enabled." };
    }
    if (!manual && latest && now.getTime() - latest.createdAt.getTime() < settings.intervalMinutes * 60000) return { sent: 0, started: true, reason: "Notification gap has not elapsed." };
    const bucket = Math.floor(now.getTime() / 1800000);
    const id = "daily-quiz-" + createHash("sha256").update(manual ? `first:${question.id}:${target.id}` : `${question.id}:${target.id}:${bucket}`).digest("hex");
    if (await tx.notificationBlast.findUnique({ where: { id }, select: { id: true } })) return { sent: 0, started: true, reason: "This notification is already recorded." };
    const index = manual || !latest ? 0 : scheduled ? scheduled.slot % settings.messages.length : bucket % settings.messages.length;
    const text = settings.messages[index];
    await tx.notificationBlast.create({ data: { id, type: "NOTICE", text, filterType: "SYSTEM", filterValue: `DAILY_JEWELLERY_QUIZ:${question.date}:${question.id}`, createdById: question.createdById, createdAt: now, recipients: { create: [{ employeeId: target.id }] } } });
    if (manual) await tx.dailyQuizQuestion.update({ where: { id: question.id }, data: { notificationsStartedAt: now, updatedAt: question.updatedAt } });
    return { sent: 1, started: true, reason: "App notification created for Ghanshyam Jangir. Future reminders are enabled.", id, targetId: target.id, text, date: question.date };
  });
  let pushError = false, pushStatus: string | null = null;
  if ("id" in result && result.id && result.targetId && result.text) {
    await sendPushToEmployees([result.targetId], { title: "💎 आज का Jewellery सवाल", body: result.text, url: `/?section=dailyQuiz&quizDate=${result.date}`, tag: result.id }, result.id, { expiresAt: Date.parse(`${result.date}T00:00:00Z`) + 86400000 - 330 * 60000 }).catch(() => { pushError = true; });
    if (manual) {
      try { pushStatus = (await prisma.messageRecipient.findUnique({ where: { blastId_employeeId: { blastId: result.id, employeeId: result.targetId } }, select: { pushStatus: true } }))?.pushStatus || null; }
      catch { /* Recording/reading phone transport status is supplementary to the saved app alert. */ }
    }
  }
  const phoneDetail = result.sent && manual ? pushStatus === "ACCEPTED" ? " Push service accepted the phone notification." : pushStatus === "NO_SUBSCRIPTION" ? " Phone push has no active subscription; allow notifications on the employee device." : pushStatus === "NOT_CONFIGURED" ? " Phone push is not configured." : pushStatus === "FAILED" || pushError ? " Phone push failed; the app alert is saved." : " Phone delivery is not confirmed." : "";
  const status = { checkedAt: now.toISOString(), sent: result.sent, started: result.started, reason: result.reason + phoneDetail, pushError, pushStatus };
  await prisma.permissionSetting.upsert({ where: { key: DAILY_QUIZ_LAST_RUN }, create: { key: DAILY_QUIZ_LAST_RUN, value: JSON.stringify(status) }, update: { value: JSON.stringify(status) } }).catch(() => null);
  return status;
}
