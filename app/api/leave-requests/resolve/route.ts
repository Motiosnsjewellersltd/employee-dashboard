import { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOverdueLeave } from "@/lib/leaveWorkflow";
export const runtime = "nodejs";
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(req: Request) {
  let session;
  try { session = await requireSession(); } catch { return reply({ ok: false, error: "Unauthorized." }, 401); }
  if (session.role !== "ADMIN") return reply({ ok: false, error: "Only Admin can close an overdue request." }, 403);
  let body;
  try { body = await req.json(); } catch { return reply({ ok: false, error: "Invalid request." }, 400); }
  const id = typeof body?.id === "string" ? body.id : "", reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || !reason || reason.length > 2000) return reply({ ok: false, error: "Select a request and enter a closure reason (1–2000 characters)." }, 400);
  try {
    const request = await prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "LeaveRequest" WHERE "id" = ${id} FOR UPDATE`);
      const current = await tx.leaveRequest.findUnique({ where: { id } });
      if (!current) return null;
      const now = new Date();
      if (!isOverdueLeave(current, now)) throw new Error("Only pending requests whose entire leave period has ended can be closed.");
      const claimed = await tx.leaveRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: "CLOSED", closureReason: reason, decidedById: session.id, decidedAt: now } });
      if (claimed.count !== 1) throw new Error("This request has already been decided.");
      // Mandatory audit is atomic with closure. No attendance/LeaveRecord write.
      await tx.activityLog.create({ data: { actorId: session.id, actorName: session.name, action: "CLOSE_OVERDUE_LEAVE_REQUEST", target: id, details: JSON.stringify({ reason, previousStatus: current.status, previousManagerStatus: current.managerStatus, fromDate: current.fromDate, toDate: current.toDate, leaveBalanceChanged: false }), createdAt: now } });
      return tx.leaveRequest.findUnique({ where: { id }, include: { decidedBy: { select: { id: true, name: true } } } });
    });
    if (!request) return reply({ ok: false, error: "Leave request not found." }, 404);
    return reply({ ok: true, data: { request } });
  } catch (error) {
    if (error instanceof Error && /Only pending|already been decided/.test(error.message)) return reply({ ok: false, error: error.message }, 409);
    return reply({ ok: false, error: "Could not close request. No closure was saved; please retry." }, 503);
  }
}
