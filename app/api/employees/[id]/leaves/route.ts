import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fail, getFinancialYear, monthEarned, ok } from "@/lib/utils";

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
    const employee = await prisma.employee.findFirst({ where: { id, deletedAt: null }, select: { doj: true } });
    if (!employee) throw new Error("Employee not found.");
    const records = await prisma.leaveRecord.findMany({ where: { employeeId: id, deletedAt: null }, orderBy: { monthYear: "asc" } });
    const { fy, months } = getFyMonths();
    const map = new Map(records.map(r => [r.monthYear, r.leave]));
    let balance = 0;
    let excessUsed = 0;
    const rows = months.map(m => {
      const used = Number(map.get(m.label) || 0);
      const eligibilityKey = employee.doj
        ? employee.doj.getFullYear() * 12 + employee.doj.getMonth() + 3
        : null;
      const monthKey = m.year * 12 + (m.month - 1);
      const earned = eligibilityKey === null || monthKey >= eligibilityKey ? m.earned : 0;
      const rawBalance = balance + earned - used;
      if (rawBalance < 0) excessUsed += Math.abs(rawBalance);
      balance = Math.max(0, rawBalance);
      return { monthYear: m.label, earned, used, balance: Number(balance.toFixed(2)) };
    });
    const used = rows.reduce((s, r) => s + r.used, 0);
    const earned = rows.reduce((s, r) => s + r.earned, 0);
    const byYear: Record<string, number> = {};
    records.forEach(r => {
      const year = String(r.monthYear).split("/")[1] || "Unknown";
      byYear[year] = (byYear[year] || 0) + Number(r.leave || 0);
    });
    return ok({
      records: records.map(r => ({ id: r.id, monthYear: r.monthYear, leave: r.leave, reason: r.reason || "" })),
      balance: {
        financialYear: fy.label,
        earned: Number(earned.toFixed(2)),
        used: Number(used.toFixed(2)),
        currentBalance: Math.max(0, Number(balance.toFixed(2))),
        rows,
        negativeBalanceWarning: excessUsed > 0,
        excessUsed: Number(excessUsed.toFixed(2))
      },
      yearwise: byYear
    });
  } catch (e) { return fail(e, 401); }
}
