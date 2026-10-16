// Shared by in-app alerts and browser push links; only known internal pages.
export function employeeNotificationTarget(value: unknown): string | null {
  const key = String(value || "").trim().toUpperCase();
  if (key === "EMPLOYEE_PROFILE_UPDATED") return "/?section=profile";
  if (key === "EMPLOYEE_REPORT" || key === "EMPLOYEE_REPORT_UPDATED") return "/?section=reporting";
  return null;
}
