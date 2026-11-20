import { parseActivity, publicGame, gradeGame } from "@/lib/quizActivity";
import { quizAudienceAllows } from "@/lib/dailyQuizReport";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publicQuizQuestion, quizAccess, quizLock } from "@/lib/dailyQuiz";
import { quizIndiaTime, validQuizDate } from "@/lib/dailyQuizRules";
export const runtime = "nodejs";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function sessionUser() { try { return await requireSession(); } catch { return null; } }
export async function GET(req: Request) {
  const session = await sessionUser(); if (!session) return reply({ ok: false, error: "Unauthorized." }, 401);
  if (session.role !== "EMPLOYEE") return reply({ ok: false, error: "Employee only." }, 403);
  try {
    const access = await quizAccess();
    if (!access.settings.enabled || !access.targets.some(person => person.id === session.id)) return reply({ ok: false, error: "Quiz is not available for this account." }, 403);
    const today = quizIndiaTime().date, date = new URL(req.url).searchParams.get("date") || today;
    if (!validQuizDate(date) || date > today) return reply({ ok: false, error: "This quiz date is not available." }, 400);
    const question = await prisma.dailyQuizQuestion.findUnique({ where: { date } });
    if (!question?.isPublished || !quizAudienceAllows(question.audience, session.id)) return reply({ ok: true, data: { today, quiz: null } });
    const answer = await prisma.dailyQuizAnswer.findUnique({ where: { questionId_employeeId: { questionId: question.id, employeeId: session.id } } });
    return reply({ ok: true, data: { today, quiz: publicQuizQuestion(question, answer, today) } });
  } catch { return reply({ ok: false, error: "Could not load today's quiz." }, 503); }
}
export async function POST(req: Request) {
  const session = await sessionUser(); if (!session) return reply({ ok: false, error: "Unauthorized." }, 401);
  if (session.role !== "EMPLOYEE") return reply({ ok: false, error: "Employee only." }, 403);
  let body; try { body = await req.json(); } catch { return reply({ ok: false, error: "Invalid answer." }, 400); }
  if (typeof body?.questionId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.questionId) || typeof body?.version !== "string" || !Number.isFinite(Date.parse(body.version)) ) return reply({ ok: false, error: "Select one answer." }, 400);
  try {
    const data = await prisma.$transaction(async tx => {
      await quizLock(tx);
      const access = await quizAccess(tx);
      if (!access.settings.enabled || !access.targets.some(person => person.id === session.id)) return { denied: true };
      const today = quizIndiaTime().date;
      const question = await tx.dailyQuizQuestion.findUnique({ where: { id: body.questionId } });
      if (!question?.isPublished || !quizAudienceAllows(question.audience, session.id) || question.date !== today || !Array.isArray(question.options)) return { invalid: true };
      if (question.updatedAt.toISOString() !== body.version) return { stale: true };
      const existing = await tx.dailyQuizAnswer.findUnique({ where: { questionId_employeeId: { questionId: question.id, employeeId: session.id } } });
      if (existing) return { duplicate: true };
      const activity = parseActivity(question.activity);
      if (activity?.type === "game") {
        const now = new Date();
        let attempt = await tx.dailyQuizGameAttempt.findUnique({ where: { questionId_employeeId: { questionId: question.id, employeeId: session.id } } });
        if (body.action === "start") {
          if (!attempt) attempt = await tx.dailyQuizGameAttempt.create({ data: { questionId: question.id, employeeId: session.id, version: body.version } });
          if (attempt.version !== body.version) return { stale: true };
          const seed = `${question.id}:${session.id}:${attempt.startedAt.toISOString()}`;
          return { game: publicGame(activity.definition, seed), startedAt: attempt.startedAt, deadline: new Date(attempt.startedAt.getTime() + 60000), serverNow: now };
        }
        if (!attempt || attempt.version !== body.version) return { notStarted: true };
        const seed = `${question.id}:${session.id}:${attempt.startedAt.toISOString()}`;
        const result = gradeGame(activity.definition, seed, body.gameSubmission, now.getTime() > attempt.startedAt.getTime() + 65000);
        const answer = await tx.dailyQuizAnswer.create({ data: { questionId: question.id, employeeId: session.id, selectedIndex: result.isCorrect ? 0 : 1, isCorrect: result.isCorrect, gameResult: { ...result, submission: body.gameSubmission } } });
        return { today, quiz: publicQuizQuestion(question, answer, today) };
      }
      if (!Number.isInteger(body.selectedIndex) || body.selectedIndex < 0 || body.selectedIndex >= question.options.length) return { invalid: true };
      const answer = await tx.dailyQuizAnswer.create({ data: { questionId: question.id, employeeId: session.id, selectedIndex: body.selectedIndex, isCorrect: body.selectedIndex === question.correctIndex } });
      return { today, quiz: publicQuizQuestion(question, answer, today) };
    });
    if ("notStarted" in data) return reply({ ok: false, error: "Start this game before submitting." }, 400);
    if ("denied" in data) return reply({ ok: false, error: "Quiz is not available for this account." }, 403);
    if ("invalid" in data) return reply({ ok: false, error: "Only today's published question can be answered." }, 400);
    if ("stale" in data) return reply({ ok: false, error: "This question was updated. Refresh and select your answer again." }, 409);
    if ("duplicate" in data) return reply({ ok: false, error: "Today's answer has already been submitted. Refresh to see it." }, 409);
    return reply({ ok: true, data });
  } catch { return reply({ ok: false, error: "Could not submit answer. Refresh before retrying." }, 503); }
}
