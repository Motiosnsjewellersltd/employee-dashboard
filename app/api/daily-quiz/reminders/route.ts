import { requireSession } from "@/lib/auth";
import { authenticateDailyQuizScheduler } from "@/lib/dailyQuizSchedulerAuth";
import { runDailyQuizNotifications } from "@/lib/dailyQuiz";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) {
  let manual = false;
  if (req.headers.has("authorization")) {
    if (!(await authenticateDailyQuizScheduler(req))) return Response.json({ ok: false, error: "Unauthorized scheduler." }, { status: 401 });
  } else {
    try { if ((await requireSession()).role !== "ADMIN") return Response.json({ ok: false, error: "Admin only." }, { status: 403 }); }
    catch { return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 }); }
    manual = true;
  }
  try { return Response.json({ ok: true, data: await runDailyQuizNotifications({ manual }) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch { return Response.json({ ok: false, error: "Quiz reminder check failed. Retry after checking setup." }, { status: 503 }); }
}
