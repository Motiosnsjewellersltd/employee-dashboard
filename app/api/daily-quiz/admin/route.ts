import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { quizAccess, quizCandidates, quizLock } from "@/lib/dailyQuiz";
import { DAILY_QUIZ_KEY, DAILY_QUIZ_LAST_RUN, quizIndiaTime, validateQuizQuestion, validateQuizSettings } from "@/lib/dailyQuizRules";
export const runtime = "nodejs";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function authorize() {
  try { const session = await requireSession(); return session.role === "ADMIN" ? session : null; } catch { return null; }
}
export async function GET() {
  const session = await authorize(); if (!session) return reply({ ok: false, error: "Admin only." }, 403);
  try {
    const [access, questions, lastRun] = await Promise.all([quizAccess(), prisma.dailyQuizQuestion.findMany({ orderBy: { date: "desc" }, take: 120, include: { answers: { select: { employeeId: true, selectedIndex: true, isCorrect: true, answeredAt: true, employee: { select: { name: true } } } } } }), prisma.permissionSetting.findUnique({ where: { key: DAILY_QUIZ_LAST_RUN } })]);
    let status = null; try { status = JSON.parse(lastRun?.value || "null"); } catch { /* unavailable */ }
    return reply({ ok: true, data: { today: quizIndiaTime().date, settings: access.settings, candidates: access.candidates.map(({ id, name, employeeCode, branch }) => ({ id, name, employeeCode, branch })), target: access.target ? { id: access.target.id, name: access.target.name, employeeCode: access.target.employeeCode } : null, questions, lastRun: status } });
  } catch { return reply({ ok: false, error: "Could not load quiz management. Check the quiz database setup." }, 503); }
}
export async function POST(req: Request) {
  const session = await authorize(); if (!session) return reply({ ok: false, error: "Admin only." }, 403);
  let body; try { body = await req.json(); } catch { return reply({ ok: false, error: "Invalid request." }, 400); }
  try {
    if (body?.action === "settings") {
      const settings = validateQuizSettings(body.settings);
      await prisma.$transaction(async tx => {
        await quizLock(tx);
        const candidates = await quizCandidates(tx);
        if (settings.targetEmployeeId ? !candidates.some(person => person.id === settings.targetEmployeeId) : settings.enabled && candidates.length !== 1) throw new Error("Select the correct active Ghanshyam Jangir employee profile. Other employees cannot be selected.");
        if (!settings.targetEmployeeId && candidates.length === 1) settings.targetEmployeeId = candidates[0].id;
        await tx.permissionSetting.upsert({ where: { key: DAILY_QUIZ_KEY }, create: { key: DAILY_QUIZ_KEY, value: JSON.stringify(settings) }, update: { value: JSON.stringify(settings) } });
        await tx.activityLog.create({ data: { actorId: session.id, actorName: session.name, action: "UPDATE_DAILY_QUIZ_PILOT_SETTINGS", target: settings.targetEmployeeId || "daily-quiz", details: JSON.stringify(settings) } });
      });
      return reply({ ok: true, data: { settings } });
    }
    if (body?.action === "question") {
      const data = validateQuizQuestion(body.question);
      const id = typeof body.id === "string" ? body.id : "";
      if (id && !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error("Invalid question.");
      if (data.date < quizIndiaTime().date) throw new Error("Past questions cannot be created or edited.");
      const question = await prisma.$transaction(async tx => {
        await quizLock(tx);
        if (data.isPublished) { const access = await quizAccess(tx); if (!access.settings.targetEmployeeId || !access.target) throw new Error("Select and save the correct test employee in Settings before publishing."); }
        if (id) {
          const current = await tx.dailyQuizQuestion.findUnique({ where: { id }, include: { _count: { select: { answers: true } } } });
          if (!current) throw new Error("Question not found.");
          if (current.date < quizIndiaTime().date || current._count.answers) throw new Error("A past or answered question is locked; create a question for another date.");
          if (current.isPublished && current.date !== data.date) throw new Error("Unpublish the question before changing its date.");
        }
        const saved = id ? await tx.dailyQuizQuestion.update({ where: { id }, data }) : await tx.dailyQuizQuestion.create({ data: { ...data, createdById: session.id } });
        await tx.activityLog.create({ data: { actorId: session.id, actorName: session.name, action: id ? "UPDATE_DAILY_QUIZ_QUESTION" : "CREATE_DAILY_QUIZ_QUESTION", target: saved.id, details: JSON.stringify(data) } });
        return saved;
      });
      return reply({ ok: true, data: { question } });
    }
    return reply({ ok: false, error: "Invalid quiz action." }, 400);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return reply({ ok: false, error: "A question already exists for this date. Edit that question instead." }, 409);
    const message = error instanceof Error ? error.message : "";
    const allowed = /^(Select |Enter |Other |Invalid |Past |Question not found|A past or answered|Unpublish )/.test(message);
    return reply({ ok: false, error: allowed ? message : "Could not save quiz. No change was committed; please retry." }, allowed ? 400 : 503);
  }
}
