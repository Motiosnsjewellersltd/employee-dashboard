import { requireSession } from "@/lib/auth";
import { requireHrPermission } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { reminderHistoryEntry, reminderHistoryWhere, summarizeReminderHistory } from "@/lib/leaveReminderHistory";
export const runtime = "nodejs";
const validId = (id: unknown): id is string => typeof id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(id);
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function authorize() {
  let session;
  try { session = await requireSession(); } catch { return reply({ ok: false, error: "Unauthorized." }, 401); }
  if (session.role !== "ADMIN" && session.role !== "HR") return reply({ ok: false, error: "Admin/HR only." }, 403);
  try { await requireHrPermission(session.role, "hrMenuLeaveRequests"); }
  catch { return reply({ ok: false, error: "Leave requests are not available." }, 403); }
  return null;
}
// Read-only bulk summary: one query, rather than a separate request for every row.
export async function POST(req: Request) {
  const denied = await authorize(); if (denied) return denied;
  let body;
  try { body = await req.json(); } catch { return reply({ ok: false, error: "Invalid request." }, 400); }
  if (!Array.isArray(body?.requestIds) || body.requestIds.length > 500 || !body.requestIds.every(validId)) return reply({ ok: false, error: "Invalid leave request IDs." }, 400);
  const ids = [...new Set<string>(body.requestIds)];
  if (!ids.length) return reply({ ok: true, data: { summaries: {} } });
  try {
    const groups = await prisma.notificationBlast.groupBy({ by: ["filterValue"], where: reminderHistoryWhere(ids), _count: { _all: true }, _max: { createdAt: true } });
    return reply({ ok: true, data: { summaries: summarizeReminderHistory(ids, groups) } });
  } catch { return reply({ ok: false, error: "Could not load reminder counts." }, 503); }
}
export async function GET(req: Request) {
  const denied = await authorize(); if (denied) return denied;
  const url = new URL(req.url), requestId = url.searchParams.get("requestId"), cursor = url.searchParams.get("cursor");
  if (!validId(requestId) || (cursor !== null && !validId(cursor))) return reply({ ok: false, error: "Invalid leave request or history cursor." }, 400);
  try {
    const request = await prisma.leaveRequest.findUnique({ where: { id: requestId }, select: { id: true, requester: { select: { name: true } } } });
    if (!request) return reply({ ok: false, error: "Leave request not found." }, 404);
    const where = reminderHistoryWhere([requestId]);
    if (cursor && !(await prisma.notificationBlast.findFirst({ where: { ...where, id: cursor }, select: { id: true } }))) return reply({ ok: false, error: "Invalid history cursor." }, 400);
    const [total, rows] = await Promise.all([
      prisma.notificationBlast.count({ where }),
      prisma.notificationBlast.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, filterValue: true, createdAt: true, recipients: { select: { employee: { select: { name: true, role: true } } } } } })
    ]);
    const items = rows.slice(0, 50).map(row => ({ id: row.id, type: reminderHistoryEntry(row.filterValue)?.type || "Reminder", createdAt: row.createdAt, recipients: row.recipients.map(recipient => recipient.employee) }));
    return reply({ ok: true, data: { requestId, employeeName: request.requester.name, total, items, nextCursor: rows.length > 50 ? rows[49].id : null } });
  } catch { return reply({ ok: false, error: "Could not load reminder history." }, 503); }
}
