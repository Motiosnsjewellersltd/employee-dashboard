import { leaveNotificationTarget } from "./leaveReminderRules";
// Shared by in-app alerts and browser push links; only known internal pages.
export function employeeNotificationTarget(value: unknown): string | null {
  const leaveTarget = leaveNotificationTarget(value);
  if (leaveTarget) return leaveTarget;
  const key = String(value || "").trim().toUpperCase();
  if (/^DAILY_JEWELLERY_QUIZ:\d{4}-\d{2}-\d{2}$/.test(key)) return `/?section=dailyQuiz&quizDate=${key.slice("DAILY_JEWELLERY_QUIZ:".length)}`;
  if (key === "EMPLOYEE_PROFILE_UPDATED") return "/?section=profile";
  if (key === "EMPLOYEE_REPORT" || key === "EMPLOYEE_REPORT_UPDATED") return "/?section=reporting";
  return null;
}
