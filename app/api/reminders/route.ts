import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { employeeSelect, fail, ok } from "@/lib/utils";

function dayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function nextOccurrence(date: Date | null, today: Date) {
  if (!date) return null;
  const occurrence = new Date(today.getFullYear(), date.getMonth(), date.getDate());
  if (occurrence < dayStart(today)) occurrence.setFullYear(today.getFullYear() + 1);
  return occurrence;
}

function daysUntil(date: Date | null, today: Date) {
  const next = nextOccurrence(date, today);
  if (!next) return null;
  return Math.round((dayStart(next).getTime() - dayStart(today).getTime()) / 86400000);
}

export async function GET() {
  try {
    const session = await requireSession();
    if (!["ADMIN", "HR"].includes(session.role)) throw new Error("Only Admin/HR allowed.");
    const employees = await prisma.employee.findMany({ where: { status: "ACTIVE", deletedAt: null }, orderBy: { name: "asc" } });
    const today = new Date();

    const birthdays = employees
      .map(employee => ({ employee, days: daysUntil(employee.dob, today) }))
      .filter(item => item.days !== null && item.days! <= 30)
      .sort((a, b) => a.days! - b.days! || a.employee.name.localeCompare(b.employee.name));

    const anniversaries = employees
      .filter(employee => employee.doj && dayStart(employee.doj) < dayStart(today))
      .map(employee => ({ employee, days: daysUntil(employee.doj, today) }))
      .filter(item => item.days !== null && item.days! <= 30)
      .sort((a, b) => a.days! - b.days! || a.employee.name.localeCompare(b.employee.name));

    const anniversaryRow = (employee: typeof employees[number], days: number) => {
      const occurrence = nextOccurrence(employee.doj, today);
      return {
        ...employeeSelect(employee),
        daysUntil: days,
        years: employee.doj && occurrence ? Math.max(0, occurrence.getFullYear() - employee.doj.getFullYear()) : 0
      };
    };

    return ok({
      today: birthdays.filter(item => item.days === 0).map(item => employeeSelect(item.employee)),
      tomorrow: birthdays.filter(item => item.days === 1).map(item => employeeSelect(item.employee)),
      upcomingBirthdays: birthdays.filter(item => item.days! > 0).map(item => ({ ...employeeSelect(item.employee), daysUntil: item.days })),
      todayAnniversaries: anniversaries.filter(item => item.days === 0).map(item => anniversaryRow(item.employee, 0)),
      upcomingAnniversaries: anniversaries.filter(item => item.days! > 0).map(item => anniversaryRow(item.employee, item.days!))
    });
  } catch (e) { return fail(e, 401); }
}
