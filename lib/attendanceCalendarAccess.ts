export function isAttendanceMonthAvailable(monthYear: string) {
  if (!/^(0?[1-9]|1[0-2])\/\d{4}$/.test(monthYear)) return false;
  const [selectedMonth, selectedYear] = monthYear.split("/").map(Number);
  return selectedYear * 12 + selectedMonth >= 2026 * 12 + 4;
}

export function attendanceCalendarMonths(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit"
  }).formatToParts(now);
  const year = Number(parts.find(part => part.type === "year")?.value);
  const month = Number(parts.find(part => part.type === "month")?.value);
  const months: string[] = [];
  for (let key = 2026 * 12 + 3; key <= year * 12 + month - 1; key++) {
    months.push(`${String(key % 12 + 1).padStart(2, "0")}/${Math.floor(key / 12)}`);
  }
  return months;
}

export function canViewAttendanceCalendar(
  viewer: { id: string; role: string },
  employee: { id: string; employeeCode?: string | null },
  monthYear?: string
) {
  if (monthYear !== undefined && !isAttendanceMonthAvailable(monthYear)) return false;
  if (viewer.role === "ADMIN" || viewer.role === "HR") return true;
  return viewer.role === "EMPLOYEE" && viewer.id === employee.id;
}
