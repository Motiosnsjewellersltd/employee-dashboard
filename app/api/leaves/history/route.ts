import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fail, getFinancialYear, monthEarned, ok } from "@/lib/utils";
import { addAuditLog } from "@/lib/audit";
import { normalizeMonthYear } from "@/lib/leaveImport";

async function requireHrOrAdmin() {
  const session = await requireSession();
  if (!["ADMIN", "HR"].includes(session.role)) throw new Error("Only Admin/HR allowed.");
  return session;
}

async function negativeBalanceStatus(employeeId: string) {
  const now = new Date();
  const fy = getFinancialYear(now);
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { doj: true } });
  const records = await prisma.leaveRecord.findMany({ where: { employeeId, deletedAt: null }, select: { monthYear: true, leave: true } });
  const usedByMonth = new Map(records.map(r => [r.monthYear, Number(r.leave || 0)]));
  const currentKey = now.getFullYear() * 100 + (now.getMonth() + 1);
  let balance = 0;
  let excess = 0;

  const months: { month: number; year: number }[] = [];
  for (let month = 4; month <= 12; month++) if (fy.start * 100 + month <= currentKey) months.push({ month, year: fy.start });
  for (let month = 1; month <= 3; month++) if (fy.end * 100 + month <= currentKey) months.push({ month, year: fy.end });

  for (const item of months) {
    const eligibilityKey = employee?.doj ? employee.doj.getFullYear() * 12 + employee.doj.getMonth() + 3 : null;
    const monthKey = item.year * 12 + (item.month - 1);
    const earned = eligibilityKey === null || monthKey >= eligibilityKey ? monthEarned(item.month) : 0;
    const label = `${String(item.month).padStart(2, "0")}/${item.year}`;
    const raw = balance + earned - Number(usedByMonth.get(label) || 0);
    if (raw < 0) excess += Math.abs(raw);
    balance = Math.max(0, raw);
  }

  return { warning: excess > 0, excess: Number(excess.toFixed(2)) };
}

export async function GET(req: NextRequest) {
  try {
    await requireHrOrAdmin();
    const url = new URL(req.url);
    const search = String(url.searchParams.get("search") || "").trim();
    const monthYearRaw = String(url.searchParams.get("monthYear") || "").trim();
    const monthYear = monthYearRaw ? normalizeMonthYear(monthYearRaw) : "";

    const records = await prisma.leaveRecord.findMany({
      where: {
        deletedAt: null,
        employee: { deletedAt: null },
        ...(monthYear ? { monthYear } : {}),
        ...(search ? {
          employee: {
            deletedAt: null,
            OR: [
              { name: { contains: search } },
              { mobile: { contains: search } },
              { designation: { contains: search } },
              { department: { contains: search } }
            ]
          }
        } : {})
      },
      include: { employee: { select: { id: true, name: true, mobile: true, designation: true, department: true } } },
      orderBy: [{ monthYear: "desc" }, { employee: { name: "asc" } }],
      take: 2000
    });

    const months = await prisma.leaveRecord.findMany({ where: { deletedAt: null }, distinct: ["monthYear"], select: { monthYear: true } });
    return ok({ records, months: months.map(x => x.monthYear).sort((a, b) => b.localeCompare(a)) });
  } catch (e) {
    return fail(e, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireHrOrAdmin();
    const body = await req.json();
    const employeeId = String(body.employeeId || "").trim();
    const monthYear = normalizeMonthYear(String(body.monthYear || "").trim());
    const leave = Number(body.leave);
    const reason = String(body.reason || "").trim();

    if (!employeeId) throw new Error("Employee required.");
    if (!monthYear) throw new Error("Valid Month/Year required.");
    if (!Number.isFinite(leave) || leave < 0) throw new Error("Leave must be a valid number 0 or greater.");

    const employee = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { id: true, name: true } });
    if (!employee) throw new Error("Employee not found.");

    const existing = await prisma.leaveRecord.findUnique({ where: { employeeId_monthYear: { employeeId, monthYear } } });
    const activeExisting = existing && !existing.deletedAt ? existing : null;
    const newLeave = Number(((activeExisting ? Number(activeExisting.leave) : 0) + leave).toFixed(2));
    const record = existing
      ? await prisma.leaveRecord.update({
          where: { id: existing.id },
          data: {
            leave: newLeave,
            reason: reason || (activeExisting ? existing.reason : null),
            deletedAt: null,
            deletedById: null,
            deletedByName: null
          }
        })
      : await prisma.leaveRecord.create({ data: { employeeId, monthYear, leave: newLeave, reason: reason || null } });

    const negativeBalance = await negativeBalanceStatus(employeeId);
    await addAuditLog({
      actorId: session.id,
      actorName: session.name,
      action: activeExisting ? "UPDATE_LEAVE" : "ADD_LEAVE",
      target: employee.name,
      details: { monthYear, addedLeave: leave, totalLeave: newLeave, reason: reason || null, source: "manual", restoredFromRecycleBin: !!existing?.deletedAt }
    });

    return ok({ record, updated: !!activeExisting, employeeName: employee.name, monthYear, negativeBalance });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await requireHrOrAdmin();
    const body = await req.json();
    const id = String(body.id || "");
    const leave = Number(body.leave);
    const reason = body.reason === undefined ? undefined : String(body.reason || "").trim();
    if (!id) throw new Error("Leave record id required.");
    if (!Number.isFinite(leave) || leave < 0) throw new Error("Leave must be a valid number 0 or greater.");

    const before = await prisma.leaveRecord.findFirst({
      where: { id, deletedAt: null },
      include: { employee: { select: { name: true } } }
    });
    if (!before) throw new Error("Leave record not found.");

    const record = await prisma.leaveRecord.update({ where: { id }, data: { leave, ...(reason !== undefined ? { reason: reason || null } : {}) } });
    const negativeBalance = await negativeBalanceStatus(before.employeeId);
    await addAuditLog({
      actorId: session.id,
      actorName: session.name,
      action: "UPDATE_LEAVE",
      target: before.employee.name,
      details: { monthYear: before.monthYear, oldLeave: before.leave, newLeave: leave, oldReason: before.reason, newReason: reason }
    });
    return ok({ record, negativeBalance });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireHrOrAdmin();
    const url = new URL(req.url);
    const id = String(url.searchParams.get("id") || "").trim();
    const monthRaw = String(url.searchParams.get("monthYear") || "").trim();
    const deleteAll = url.searchParams.get("all") === "1";
    const deletedAt = new Date();
    const deleteData = { deletedAt, deletedById: session.id, deletedByName: session.name };

    if (id) {
      const before = await prisma.leaveRecord.findFirst({
        where: { id, deletedAt: null },
        include: { employee: { select: { name: true } } }
      });
      if (!before) throw new Error("Leave record not found.");
      await prisma.leaveRecord.update({ where: { id }, data: deleteData });
      await addAuditLog({ actorId: session.id, actorName: session.name, action: "DELETE_LEAVE", target: before.employee.name, details: { monthYear: before.monthYear, leave: before.leave, reason: before.reason, softDelete: true } });
      return ok({ deleted: 1 });
    }

    if (monthRaw) {
      const monthYear = normalizeMonthYear(monthRaw);
      if (!monthYear) throw new Error("Valid Month/Year required.");
      const result = await prisma.leaveRecord.updateMany({ where: { monthYear, deletedAt: null }, data: deleteData });
      await addAuditLog({ actorId: session.id, actorName: session.name, action: "DELETE_MONTH_LEAVES", target: monthYear, details: { deleted: result.count, softDelete: true } });
      return ok({ deleted: result.count, monthYear });
    }

    if (deleteAll) {
      const result = await prisma.leaveRecord.updateMany({ where: { deletedAt: null }, data: deleteData });
      await addAuditLog({ actorId: session.id, actorName: session.name, action: "DELETE_ALL_LEAVES", target: "All leave records", details: { deleted: result.count, softDelete: true } });
      return ok({ deleted: result.count });
    }

    throw new Error("Delete target required.");
  } catch (e) {
    return fail(e);
  }
}
