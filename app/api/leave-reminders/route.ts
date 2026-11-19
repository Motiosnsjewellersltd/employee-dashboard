import { requireSession } from "@/lib/auth";
import { requireHrPermission } from "@/lib/permissions";
import { authenticateLeaveScheduler, type LeaveSchedulerAuthFailure } from "@/lib/leaveReminderAuth";
import { runLeaveReminders } from "@/lib/leaveReminders";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    if (req.headers.has("authorization")) {
      let failure: LeaveSchedulerAuthFailure = { code: "SCHEDULER_TOKEN_REJECTED" };
      if (!(await authenticateLeaveScheduler(req, reason => { failure = reason; }))) {
        console.warn("Leave reminder scheduler authentication rejected", failure);
        return Response.json({ ok: false, error: "Unauthorized scheduler.", ...failure }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
      }
    } else {
      let session;
      try { session = await requireSession(); } catch { return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 }); }
      if (session.role !== "ADMIN" && session.role !== "HR") return Response.json({ ok: false, error: "Admin/HR only." }, { status: 403 });
      try { await requireHrPermission(session.role, "hrMenuLeaveRequests"); } catch { return Response.json({ ok: false, error: "Leave requests are not available." }, { status: 403 }); }
    }
    const cursor = new URL(req.url).searchParams.get("cursor") || "";
    if (cursor && !/^[a-zA-Z0-9_-]{1,100}$/.test(cursor)) return Response.json({ ok: false, error: "Invalid cursor." }, { status: 400 });
    return Response.json({ ok: true, data: await runLeaveReminders({ cursor }) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ ok: false, error: "Leave reminder check failed. Retry the check." }, { status: 500 }); }
}
