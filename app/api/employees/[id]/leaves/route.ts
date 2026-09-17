import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { employeeEarnsLeaveInMonth, fail, getFinancialYear, monthEarned, ok } from "@/lib/utils";
import { addAuditLog } from "@/lib/audit";

function getFyMonths() {
  const now = new Date();
  const fy = getFinancialYear(now);
  const months: { month: number; year: number; label: string; earned: number }[] = [];
  const currentKey = now.getFullYear() * 100 + (now.getMonth() + 1);
  for (let m = 4; m <= 12; m++) {
    const key = fy.start * 100 + m;
    if (key <= currentKey) months.push({ month: m, year: fy.start, label: `${String(m).padStart(2, "0")}/${fy.start}`, earned: monthEarned(m) });
  }
  for (let m = 1; m <= 3; m++) {
    const key = fy.end * 100 + m;
    if (key <= currentKey) months.push({ month: m, year: fy.end, label: `${String(m).padStart(2, "0")}/${fy.end}`, earned: monthEarned(m) });
  }
  return { fy, months };
}

export async function GET(_: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    if (session.role === "EMPLOYEE" && session.id !== id) throw new Error("Unauthorized");
    const employee = await prisma.employee.findFirst({ where: { id, deletedAt: null }, select: { doj: true, exitDate: true, status: true, updatedAt: true } });
    if (!employee) throw new Error("Employee not found.");
    const records = await prisma.leaveRecord.findMany({ where: { employeeId: id, deletedAt: null }, orderBy: { monthYear: "asc" } });
    const branchHistory = await prisma.branchTransfer.findMany({
      where: { employeeId: id },
      orderBy: { transferredAt: "desc" },
      select: { id: true, fromBranch: true, toBranch: true, changedByName: true, transferredAt: true }
    });
    const { fy, months } = getFyMonths();
    const exitMonthKey = employee.exitDate
      ? employee.exitDate.getFullYear() * 12 + employee.exitDate.getMonth()
      : null;
    const isVisibleMonth = (monthYear: string) => {
      if (exitMonthKey === null) return true;
      const [month, year] = String(monthYear).split("/").map(Number);
      if (!month || !year) return true;
      return year * 12 + (month - 1) <= exitMonthKey;
    };
    const visibleRecords = records.filter(record => isVisibleMonth(record.monthYear));
    // The exit month is not an accrual month. Show balance rows only for the
    // fully completed months before the employee's Exit / Leave Date month.
    const visibleMonths = months.filter(month => exitMonthKey === null || month.year * 12 + (month.month - 1) < exitMonthKey);
    const map = new Map(visibleRecords.map(r => [r.monthYear, r.leave]));
    let balance = 0;
    let excessUsed = 0;
    const rows = visibleMonths.map(m => {
      const used = Number(map.get(m.label) || 0);
      const earned = employeeEarnsLeaveInMonth(employee, m.year, m.month) ? m.earned : 0;
      const rawBalance = balance + earned - used;
      if (rawBalance < 0) excessUsed += Math.abs(rawBalance);
      balance = Math.max(0, rawBalance);
      return { monthYear: m.label, earned, used, balance: Number(balance.toFixed(2)) };
    });
    const used = rows.reduce((s, r) => s + r.used, 0);
    const earned = rows.reduce((s, r) => s + r.earned, 0);
    const byYear: Record<string, number> = {};
    visibleRecords.forEach(r => {
      const year = String(r.monthYear).split("/")[1] || "Unknown";
      byYear[year] = (byYear[year] || 0) + Number(r.leave || 0);
    });
    return ok({
      records: visibleRecords.map(r => ({ id: r.id, monthYear: r.monthYear, leave: r.leave, reason: r.reason || "" })),
      balance: {
        financialYear: fy.label,
        earned: Number(earned.toFixed(2)),
        used: Number(used.toFixed(2)),
        currentBalance: Math.max(0, Number(balance.toFixed(2))),
        rows,
        negativeBalanceWarning: excessUsed > 0,
        excessUsed: Number(excessUsed.toFixed(2))
      },
      yearwise: byYear,
      branchHistory
    });
  } catch (e) { return fail(e, 401); }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN") throw new Error("Only Admin can delete branch transfer history.");
    const { id: employeeId } = await ctx.params;
    const transferId = String(new URL(req.url).searchParams.get("branchTransferId") || "").trim();
    if (!transferId) throw new Error("Branch transfer record is required.");
    const transfer = await prisma.branchTransfer.findFirst({ where: { id: transferId, employeeId }, include: { employee: { select: { name: true } } } });
    if (!transfer) throw new Error("Branch transfer record not found.");
    await prisma.branchTransfer.delete({ where: { id: transferId } });
    await addAuditLog({ actorId: session.id, actorName: session.name, action: "DELETE_BRANCH_TRANSFER_HISTORY", target: transfer.employee.name, details: { fromBranch: transfer.fromBranch, toBranch: transfer.toBranch, transferredAt: transfer.transferredAt } });
    return ok({ deleted: 1 });
  } catch (e) { return fail(e); }
}
