import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addAuditLog } from "@/lib/audit";
import { fail, ok } from "@/lib/utils";
import {
  WEEK_OFF_PREFIX, WeekOffChange, istToday, mondayOf, parseWeekOffEvents,
  permanentDayOn, validISODate, weekOffOn, weekOffSummary
} from "@/lib/weekOff";

const isManager = (role: string) => role === "ADMIN" || role === "HR";

type StoredRow = { key: string; value: string };
function eventsFor(rows: StoredRow[], employeeId: string): WeekOffChange[] {
  const prefix = `${WEEK_OFF_PREFIX}${employeeId}:`;
  return rows.filter(x => x.key.startsWith(prefix))
    .map(x => parseWeekOffEvents(x.value))
    .filter((x): x is WeekOffChange => x !== null)
    .sort((a, b) => a.changedAt.localeCompare(b.changedAt));
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const requestedId = new URL(req.url).searchParams.get("employeeId")?.trim() || "";
    if (!isManager(session.role) && requestedId && requestedId !== session.id) return fail("Not allowed to view another employee's week off.", 403);
    const employeeId = isManager(session.role) ? requestedId : session.id;

    if (employeeId) {
      const employee = await prisma.employee.findFirst({
        where: { id: employeeId, deletedAt: null, ...(isManager(session.role) ? {} : { role: "EMPLOYEE" }) },
        select: { id: true, role: true, name: true, employeeCode: true, branch: true, department: true }
      });
      if (!employee || employee.role !== "EMPLOYEE") return fail("Employee not found.", 404);
      const rows = await prisma.permissionSetting.findMany({ where: { key: { startsWith: `${WEEK_OFF_PREFIX}${employeeId}:` } }, select: { key: true, value: true } });
      const history = eventsFor(rows, employee.id);
      return ok({ employee, ...weekOffSummary(history), history: isManager(session.role) ? [...history].reverse() : [] });
    }

    if (!isManager(session.role)) return fail("Not allowed.", 403);
    const [employees, rows] = await Promise.all([
      prisma.employee.findMany({
        where: { role: "EMPLOYEE", deletedAt: null, status: "ACTIVE", exitDate: null },
        select: { id: true, employeeCode: true, name: true, branch: true, department: true, designation: true },
        orderBy: { name: "asc" }
      }),
      prisma.permissionSetting.findMany({ where: { key: { startsWith: WEEK_OFF_PREFIX } }, select: { key: true, value: true } })
    ]);
    const today = istToday();
    return ok({ employees: employees.map(e => ({ ...e, ...weekOffSummary(eventsFor(rows, e.id), today) })) });
  } catch (e) {
    return fail(e, 403);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!isManager(session.role)) return fail("Only Admin/HR can update week offs.", 403);
    const body = await req.json();
    const kind = body?.kind;
    if (kind !== "PERMANENT" && kind !== "TEMPORARY") return fail("Invalid change type.", 400);
    const weekday = Number(body?.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return fail("Select a valid week-off day.", 400);
    const date = validISODate(body?.effectiveDate);
    if (!date) return fail("Select a valid effective date.", 400);
    const effectiveDate = kind === "TEMPORARY" ? mondayOf(date) : date;
    const reason = String(body?.reason || "").trim().slice(0, 500);
    const idsInput: unknown[] = Array.isArray(body?.employeeIds) ? body.employeeIds : [body?.employeeId];
    const employeeIds = Array.from(new Set(idsInput.filter((id): id is string => typeof id === "string" && Boolean(id.trim())).map(id => id.trim())));
    if (!employeeIds.length || employeeIds.length > 500) return fail("Select between 1 and 500 employees.", 400);
    if (kind === "TEMPORARY" && employeeIds.length !== 1) return fail("Temporary changes must be set for one employee at a time.", 400);

    const employees = await prisma.employee.findMany({ where: { id: { in: employeeIds }, role: "EMPLOYEE", deletedAt: null, status: "ACTIVE", exitDate: null }, select: { id: true, name: true } });
    if (employees.length !== employeeIds.length) return fail("Some employees are not active or could not be found.", 400);
    const existing = await prisma.permissionSetting.findMany({
      where: { OR: employeeIds.map(id => ({ key: { startsWith: `${WEEK_OFF_PREFIX}${id}:` } })) },
      select: { key: true, value: true }
    });
    const timestamp = new Date().toISOString();
    const newRecords = employees.map(employee => {
      const history = eventsFor(existing, employee.id);
      const previousWeekday = kind === "PERMANENT" ? permanentDayOn(history, effectiveDate) : weekOffOn(history, effectiveDate);
      if (kind === "TEMPORARY" && permanentDayOn(history, effectiveDate) === null) throw new Error(`Set a fixed week off for ${employee.name} before adding a temporary change.`);
      const record: WeekOffChange = { kind, weekday, effectiveDate, previousWeekday, changedAt: timestamp, changedById: session.id, changedByName: session.name, reason };
      return { key: `${WEEK_OFF_PREFIX}${employee.id}:${timestamp}:${randomUUID()}`, value: JSON.stringify(record) };
    });
    await prisma.permissionSetting.createMany({ data: newRecords });
    await addAuditLog({ actorId: session.id, actorName: session.name, action: "UPDATE_EMPLOYEE_WEEK_OFF", target: employees.length === 1 ? employees[0].name : `${employees.length} employees`, details: { employeeIds, kind, weekday, effectiveDate, reason } });
    return ok({ updated: employees.length });
  } catch (e) {
    return fail(e, 400);
  }
}
