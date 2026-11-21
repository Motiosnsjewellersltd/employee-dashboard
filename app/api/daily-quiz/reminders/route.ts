import { requireSession } from "@/lib/auth";
import { authenticateDailyQuizScheduler, type DailyQuizSchedulerAuthFailure } from "@/lib/dailyQuizSchedulerAuth";
import { runDailyQuizNotifications } from "@/lib/dailyQuiz";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) {
  let manual = false, questionId = "";
  if (req.headers.has("authorization")) {
    let failure: DailyQuizSchedulerAuthFailure | undefined;
    if (!(await authenticateDailyQuizScheduler(req, detail => { failure = detail; }))) {
      console.warn("Quiz reminder scheduler authentication rejected", failure);
      return Response.json({ ok: false, error: "Unauthorized scheduler.", ...failure }, { status: 401 });
    }
  } else {
    try { if ((await requireSession()).role !== "ADMIN") return Response.json({ ok: false, error: "Admin only." }, { status: 403 }); }
    catch { return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 }); }
    manual = true;
    let body; try { body = await req.json(); } catch { return Response.json({ ok: false, error: "Select a question." }, { status: 400 }); }
    if (typeof body?.questionId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(body.questionId)) return Response.json({ ok: false, error: "Select a valid question." }, { status: 400 });
    questionId = body.questionId;
  }
  try {
    const data = await runDailyQuizNotifications({ manual, questionId });
    if (manual && !data.started) return Response.json({ ok: false, error: data.reason, data }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
    return Response.json({ ok: true, data }, { headers: { "Cache-Control": "private, no-store" } });
  }
  catch { return Response.json({ ok: false, error: "Quiz reminder check failed. Retry after checking setup." }, { status: 503 }); }
}
