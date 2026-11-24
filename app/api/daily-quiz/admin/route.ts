import { gameLibrary, gameRevision, GAME_LIBRARY_KEY } from "@/lib/quizGameLibrary";
import { validateGameContent } from "@/lib/quizGameContent";
import { activityForSave, publicGame, parseActivity } from "@/lib/quizActivity";
import { QUESTION_LIBRARY } from "@/lib/quizActivityCatalog";
import { Prisma } from "@prisma/client";
import { questionNotificationWhere, quizQuestionReport } from "@/lib/dailyQuizReport";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { quizAccess, quizCandidates, quizLock } from "@/lib/dailyQuiz";
import { DAILY_QUIZ_KEY, DAILY_QUIZ_LAST_RUN, quizIndiaTime, selectedQuizIds, validQuizDate, validateQuizQuestion, validateQuizSettings } from "@/lib/dailyQuizRules";
export const runtime = "nodejs";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function authorize() {
  try { const session = await requireSession(); return session.role === "ADMIN" ? session : null; } catch { return null; }
}
export async function GET(req?: Request) {
  const session = await authorize(); if (!session) return reply({ ok: false, error: "Admin only." }, 403);
  const date = req ? new URL(req.url).searchParams.get("date") || "" : "";
  if (date && !validQuizDate(date)) return reply({ ok: false, error: "Invalid report date." }, 400);
  try {
    const [access, questions, lastRun, games] = await Promise.all([quizAccess(), prisma.dailyQuizQuestion.findMany({ where: date ? { date } : undefined, orderBy: { date: "desc" }, take: 120, include: { answers: { select: { employeeId: true, selectedIndex: true, isCorrect: true, answeredAt: true, employee: { select: { name: true } } } } } }), prisma.permissionSetting.findUnique({ where: { key: DAILY_QUIZ_LAST_RUN } }), gameLibrary()]);
    let status = null; try { status = JSON.parse(lastRun?.value || "null"); } catch { /* unavailable */ }
    return reply({ ok: true, data: { today: quizIndiaTime().date, settings: access.settings, candidates: access.candidates.map(({ id, name, employeeCode, branch, department, designation }) => ({ id, name, employeeCode, branch, department, designation })), target: access.target ? { id: access.target.id, name: access.target.name, employeeCode: access.target.employeeCode } : null, catalog: { games: games.map(game => ({ ...game, revision: gameRevision(game), preview: publicGame(game, "admin-preview") })), questions: QUESTION_LIBRARY }, questions: questions.map(question => { const activity = parseActivity(question.activity); return { ...question, gamePreview: activity?.type === "game" ? publicGame(activity.definition, "admin-preview") : null, report: quizQuestionReport(question, access.targets.map(person => ({ employeeId: person.id, name: person.name }))) }; }), lastRun: status } });
  } catch { return reply({ ok: false, error: "Could not load quiz management. Check the quiz database setup." }, 503); }
}
export async function POST(req: Request) {
  const session = await authorize(); if (!session) return reply({ ok: false, error: "Admin only." }, 403);
  let body; try { body = await req.json(); } catch { return reply({ ok: false, error: "Invalid request." }, 400); }
  try {
    if (body?.action === "gameContent") {
      const definition = validateGameContent(body.game);
      await prisma.$transaction(async tx => {
        await quizLock(tx);
        const current = (await gameLibrary(tx)).find(game => game.id === definition.id)!;
        if (body.revision !== gameRevision(current)) throw new Error("Other changes were saved for this game. Refresh before editing again.");
        const row = await tx.permissionSetting.findUnique({ where: { key: GAME_LIBRARY_KEY } });
        const saved = JSON.parse(row?.value || "{}");
        saved[definition.id] = definition;
        const value = JSON.stringify(saved);
        await tx.permissionSetting.upsert({ where: { key: GAME_LIBRARY_KEY }, create: { key: GAME_LIBRARY_KEY, value }, update: { value } });
        await tx.activityLog.create({ data: { actorId: session.id, actorName: session.name, action: "UPDATE_DAILY_QUIZ_GAME_CONTENT", target: definition.id, details: JSON.stringify({ title: definition.title }) } });
      });
      return reply({ ok: true, data: { game: { ...definition, revision: gameRevision(definition), preview: publicGame(definition, "admin-preview") } } });
    }
    if (body?.action === "settings") {
      const settings = validateQuizSettings(body.settings);
      await prisma.$transaction(async tx => {
        await quizLock(tx);
        const candidates = await quizCandidates(tx);
        const ids = selectedQuizIds(settings);
        if (ids.some(id => !candidates.some(person => person.id === id))) throw new Error("Select eligible active employees; Driver, Security and Pantry cannot be selected.");
        // Explicitly empty means nobody. Keep legacy single-selection data compatible.
        settings.selectedEmployeeIds = ids;
        settings.targetEmployeeId = ids[0] || "";
        const audience = candidates.filter(person => ids.includes(person.id)).map(person => ({ employeeId: person.id, name: person.name }));
        // Selection changes apply to today's/future published activities, preserving answer versions.
        await tx.$executeRaw(Prisma.sql`UPDATE "DailyQuizQuestion" SET "audience" = ${JSON.stringify(audience)}::jsonb WHERE "date" >= ${quizIndiaTime().date} AND "isPublished" = true`);
        await tx.permissionSetting.upsert({ where: { key: DAILY_QUIZ_KEY }, create: { key: DAILY_QUIZ_KEY, value: JSON.stringify(settings) }, update: { value: JSON.stringify(settings) } });
        await tx.activityLog.create({ data: { actorId: session.id, actorName: session.name, action: "UPDATE_DAILY_QUIZ_PILOT_SETTINGS", target: settings.targetEmployeeId || "daily-quiz", details: JSON.stringify(settings) } });
      });
      return reply({ ok: true, data: { settings } });
    }
    if (body?.action === "question") {
      const activity = activityForSave(body.question?.activity, await gameLibrary());
      const data = validateQuizQuestion(activity?.type === "game" ? { ...body.question, question: activity.definition.title, options: ["Game complete", "Try again", "Not played"], correctIndex: 0, explanation: "Game result" } : body.question);
      const id = typeof body.id === "string" ? body.id : "";
      if (id && !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error("Invalid question.");
      if (!id && data.date < quizIndiaTime().date) throw new Error("Past questions cannot be created.");
      const question = await prisma.$transaction(async tx => {
        await quizLock(tx);
        const access = data.isPublished ? await quizAccess(tx) : null;
        if (data.isPublished && (!access?.targets.length)) throw new Error("Select and save eligible employees in Settings before publishing.");
        if (id) {
          const current = await tx.dailyQuizQuestion.findUnique({ where: { id }, include: { _count: { select: { answers: true } } } });
          if (!current) throw new Error("Question not found.");
          if (current._count.answers) throw new Error("An answered question cannot be edited. Use View or Delete.");
        }
        if (id) await tx.dailyQuizGameAttempt.deleteMany({ where: { questionId: id } });
        const audience = access?.targets.map(person => ({ employeeId: person.id, name: person.name })) || [];
        const saved = id ? await tx.dailyQuizQuestion.update({ where: { id }, data: { ...data, audience, activity: activity ? JSON.parse(JSON.stringify(activity)) : Prisma.DbNull } }) : await tx.dailyQuizQuestion.create({ data: { ...data, audience, activity: activity ? JSON.parse(JSON.stringify(activity)) : Prisma.DbNull, createdById: session.id } });
        await tx.activityLog.create({ data: { actorId: session.id, actorName: session.name, action: id ? "UPDATE_DAILY_QUIZ_QUESTION" : "CREATE_DAILY_QUIZ_QUESTION", target: saved.id, details: JSON.stringify(data) } });
        return saved;
      });
      return reply({ ok: true, data: { question } });
    }
    return reply({ ok: false, error: "Invalid quiz action." }, 400);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return reply({ ok: false, error: "A question already exists for this date. Edit that question instead." }, 409);
    const message = error instanceof Error ? error.message : "";
    const allowed = /^(Select |Enter |Other |Invalid |Past |Question not found|An answered|Unpublish )/.test(message);
    return reply({ ok: false, error: allowed ? message : "Could not save quiz. No change was committed; please retry." }, allowed ? 400 : 503);
  }
}

export async function DELETE(req: Request) {
  const session = await authorize(); if (!session) return reply({ ok: false, error: "Admin only." }, 403);
  let body; try { body = await req.json(); } catch { return reply({ ok: false, error: "Invalid request." }, 400); }
  if (typeof body?.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.id)) return reply({ ok: false, error: "Invalid question." }, 400);
  try {
    const result = await prisma.$transaction(async tx => {
      await quizLock(tx);
      const question = await tx.dailyQuizQuestion.findUnique({ where: { id: body.id } });
      if (!question) return null;
      const answers = await tx.dailyQuizAnswer.deleteMany({ where: { questionId: question.id } });
      // Recipient/read/push-result records cascade from the deleted blasts.
      const notifications = await tx.notificationBlast.deleteMany({ where: questionNotificationWhere(question.id, question.date) });
      await tx.activityLog.deleteMany({ where: { target: question.id, action: { in: ["CREATE_DAILY_QUIZ_QUESTION", "UPDATE_DAILY_QUIZ_QUESTION"] } } });
      await tx.dailyQuizQuestion.delete({ where: { id: question.id } });
      const last = await tx.permissionSetting.findUnique({ where: { key: DAILY_QUIZ_LAST_RUN } });
      let lastDate = "";
      try { if (last) lastDate = quizIndiaTime(new Date(JSON.parse(last.value).checkedAt)).date; } catch { /* Malformed legacy check metadata has no reliable date. */ }
      if (lastDate === question.date) await tx.permissionSetting.deleteMany({ where: { key: DAILY_QUIZ_LAST_RUN } });
      // Retain only a deletion audit receipt, never question text/options/answers/names.
      await tx.activityLog.create({ data: { actorId: session.id, actorName: session.name, action: "DELETE_DAILY_QUIZ_QUESTION", target: question.id, details: JSON.stringify({ answersDeleted: answers.count, notificationsDeleted: notifications.count }) } });
      return { deleted: true, answersDeleted: answers.count, notificationsDeleted: notifications.count };
    });
    return result ? reply({ ok: true, data: result }) : reply({ ok: false, error: "Question not found." }, 404);
  } catch { return reply({ ok: false, error: "Could not delete question. Nothing was deleted; please retry." }, 503); }
}
