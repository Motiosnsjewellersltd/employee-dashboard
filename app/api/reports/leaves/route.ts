import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fail, getFinancialYear, monthEarned, ok } from "@/lib/utils";

function monthNumber(label: string) {
  return Number(String(label).split("/")[0] || 0);
}

export async function GET() {
  try {
    const session = await requireSession();
    if (!["ADMIN", "HR"].includes(session.role)) throw new Error("Only Admin/HR allowed.");

    const fy = getFinancialYear(new Date());
    const current = new Date();
    const currentMonthLabel = `${String(current.getMonth() + 1).padStart(2, "0")}/${current.getFullYear()}`;

    const employees = await prisma.employee.findMany({ where: { role: { not: "ADMIN" }, status: "ACTIVE", deletedAt: null }, include: { leaves: { where: { deletedAt: null } } }, orderBy: { name: "asc" } });

    const departmentMap = new Map<string, { department: string; employees: number; used: number; earned: number }>();
    const employeeSummary: any[] = [];
    let currentMonthUsed = 0;

    for (const e of employees) {
      const dept = e.department || "-";
      const item = departmentMap.get(dept) || { department: dept, employees: 0, used: 0, earned: 0 };
      item.employees += 1;

      let used = 0;
      let earned = 0;

      for (const l of e.leaves) {
        const [mm, yy] = String(l.monthYear).split("/").map(Number);
        if (!mm || !yy) continue;
        if (yy === fy.start || yy === fy.end) {
          if ((yy === fy.start && mm >= 4) || (yy === fy.end && mm <= 3)) {
            used += Number(l.leave || 0);
          }
        }
        if (l.monthYear === currentMonthLabel) currentMonthUsed += Number(l.leave || 0);
      }

      for (let y = fy.start; y <= current.getFullYear(); y++) {
        const from = y === fy.start ? 4 : 1;
        const to = y === current.getFullYear() ? current.getMonth() + 1 : 12;
        for (let m = from; m <= to; m++) {
          const eligibilityKey = e.doj ? e.doj.getFullYear() * 12 + e.doj.getMonth() + 3 : null;
          const monthKey = y * 12 + (m - 1);
          if (eligibilityKey === null || monthKey >= eligibilityKey) earned += monthEarned(m);
        }
      }

      item.used += used;
      item.earned += earned;
      employeeSummary.push({ id: e.id, name: e.name, department: dept, designation: e.designation, used, earned, balance: Math.max(0, earned - used) });
      departmentMap.set(dept, item);
    }

    const departments = Array.from(departmentMap.values()).map(x => ({ ...x, used: Number(x.used.toFixed(2)), earned: Number(x.earned.toFixed(2)), balance: Number(Math.max(0, x.earned - x.used).toFixed(2)) })).sort((a, b) => b.used - a.used);
    const highestLeaves = employeeSummary.sort((a, b) => b.used - a.used).slice(0, 20);

    return ok({ financialYear: fy.label, currentMonth: currentMonthLabel, currentMonthUsed, departments, highestLeaves });
  } catch (e) {
    return fail(e, 401);
  }
}
