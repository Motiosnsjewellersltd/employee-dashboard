import { isAttendanceMonthAvailable } from "./attendanceCalendarAccess";

export type RecentEmployeePage = { kind: "attendance" | "reports" | "incentive" | "leave"; monthYear?: string };
export function validRecentPages(value: unknown): RecentEmployeePage[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((row): row is RecentEmployeePage => {
    if (!row || typeof row !== "object") return false;
    const item = row as RecentEmployeePage;
    if (!["attendance", "reports", "incentive", "leave"].includes(item.kind)) return false;
    if (item.kind === "attendance" && (typeof item.monthYear !== "string" || !isAttendanceMonthAvailable(item.monthYear))) return false;
    const key = item.kind + (item.kind === "attendance" ? item.monthYear : "");
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 3).map(row => row.kind === "attendance" ? { kind: row.kind, monthYear: row.monthYear } : { kind: row.kind });
}
export function readEmployeeRecent(id: string): RecentEmployeePage[] {
  try { return validRecentPages(JSON.parse(localStorage.getItem(`motisons-recent-v1:${id}`) || "[]")); } catch { return []; }
}
export function rememberEmployeePage(id: string, row: RecentEmployeePage) {
  try {
    localStorage.setItem(`motisons-recent-v1:${id}`, JSON.stringify(validRecentPages([row, ...readEmployeeRecent(id)])));
    window.dispatchEvent(new CustomEvent("motisons-recent-updated", { detail: { employeeId: id } }));
  } catch { /* Storage can be disabled; navigation still works. */ }
}
export function monthLabel(value: string) {
  const [month, year] = value.split("/").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}
