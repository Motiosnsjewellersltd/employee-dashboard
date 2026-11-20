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
export async function runDailyQuizNotifications({ now = new Date(), manual = false }: { now?: Date; manual?: boolean } = {}) {
  const result = await prisma.$transaction(async tx => {
    await quizLock(tx);
    const { settings, target } = await quizAccess(tx);
    if (!settings.enabled || !settings.notificationsEnabled) return { sent: 0, reason: "Quiz or notifications are paused." };
    if (!settings.targetEmployeeId || !target) return { sent: 0, reason: "No unique eligible Ghanshyam Jangir profile is selected." };
    const current = quizIndiaTime(now), scheduled = quizNotificationSlot(settings, now);
    if (!manual && !scheduled) return { sent: 0, reason: "Outside notification hours (IST)." };
    const question = await tx.dailyQuizQuestion.findUnique({ where: { date: current.date } });
    if (!question?.isPublished) return { sent: 0, reason: "No published question for today." };
    if (!quizAudienceAllows(question.audience, target.id)) return { sent: 0, reason: "The selected employee is not in this question audience." };
    const answer = await tx.dailyQuizAnswer.findUnique({ where: { questionId_employeeId: { questionId: question.id, employeeId: target.id } } });
    if (answer) return { sent: 0, reason: "Today's question is already answered; reminders stopped." };
    const latest = await tx.notificationBlast.findFirst({ where: { ...questionNotificationWhere(question.id, current.date), recipients: { some: { employeeId: target.id } } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    if (latest && now.getTime() - latest.createdAt.getTime() < settings.intervalMinutes * 60000) return { sent: 0, reason: "Notification gap has not elapsed." };
    // No catch-up burst: only one current message, even after a delayed job.
    const bucket = Math.floor(now.getTime() / 1800000);
    const id = "daily-quiz-" + createHash("sha256").update(`${question.id}:${target.id}:${bucket}`).digest("hex");
    if (await tx.notificationBlast.findUnique({ where: { id }, select: { id: true } })) return { sent: 0, reason: "This notification is already recorded." };
    const index = scheduled ? scheduled.slot % settings.messages.length : bucket % settings.messages.length;
    const text = settings.messages[index];
    await tx.notificationBlast.create({ data: { id, type: "NOTICE", text, filterType: "SYSTEM", filterValue: `DAILY_JEWELLERY_QUIZ:${current.date}:${question.id}`, createdById: question.createdById, createdAt: now, recipients: { create: [{ employeeId: target.id }] } } });
    return { sent: 1, reason: "App notification created for the test employee only.", id, targetId: target.id, text, date: current.date };
  });
  let pushError = false;
  if ("id" in result && result.id && result.targetId && result.text) {
    await sendPushToEmployees([result.targetId], { title: "💎 आज का Jewellery सवाल", body: result.text, url: `/?section=dailyQuiz&quizDate=${result.date}`, tag: result.id }, result.id).catch(() => { pushError = true; });
  }
  const status = { checkedAt: now.toISOString(), sent: result.sent, reason: result.reason, pushError };
  await prisma.permissionSetting.upsert({ where: { key: DAILY_QUIZ_LAST_RUN }, create: { key: DAILY_QUIZ_LAST_RUN, value: JSON.stringify(status) }, update: { value: JSON.stringify(status) } }).catch(() => null);
  return status;
}
