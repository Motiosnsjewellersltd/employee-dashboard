export const LEAVE_REMINDER_HOURS = 6;
export type ReminderRequest = { id: string; status: string; managerStatus: string; createdAt: Date | string; fromDate: Date | string };
export type ReminderKind = "LEAVE_MANAGER_REMINDER" | "LEAVE_MANAGER_PENDING_24H" | "LEAVE_STARTING_SOON";
export type DueReminder = { kind: ReminderKind; slot: number; key: string };
export function leaveStartInIndia(fromDate: Date | string) {
  const date = new Date(fromDate);
  if (!Number.isFinite(date.getTime())) return NaN;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - 330 * 60 * 1000;
}
export function dueLeaveReminders(request: ReminderRequest, now = new Date()): DueReminder[] {
  const created = new Date(request.createdAt).getTime(), start = leaveStartInIndia(request.fromDate), time = now.getTime();
  if (request.status !== "PENDING" || !Number.isFinite(created) || !Number.isFinite(start) || created > time) return [];
  const age = time - created, due: DueReminder[] = [];
  if (request.managerStatus === "PENDING") {
    if (age >= 6 * 3600000) {
      const slot = Math.floor(age / (6 * 3600000));
      due.push({ kind: "LEAVE_MANAGER_REMINDER", slot, key: `${request.id}:manager:${slot}` });
    }
    if (age >= 24 * 3600000) due.push({ kind: "LEAVE_MANAGER_PENDING_24H", slot: 0, key: `${request.id}:hr-24h` });
  }
  if (start > time && start - time <= 24 * 3600000) due.push({ kind: "LEAVE_STARTING_SOON", slot: 0, key: `${request.id}:urgent` });
  return due;
}
export function leaveRequestTarget(id: string) { return `/?section=leaveRequests&requestId=${encodeURIComponent(id)}`; }
export function leaveReminderAction(kind: ReminderKind | "NEW_LEAVE_REQUEST_MANAGER", id: string, slot = 0) {
  return `${kind}:${id}${slot ? `:${slot}` : ""}`;
}
export function leaveNotificationTarget(value: unknown): string | null {
  const text = String(value || "").trim();
  const match = /^(?:NEW_LEAVE_REQUEST_MANAGER|LEAVE_MANAGER_REMINDER|LEAVE_MANAGER_PENDING_24H|LEAVE_STARTING_SOON):([a-zA-Z0-9_-]{1,100})(?::\d+)?$/.exec(text);
  return match ? leaveRequestTarget(match[1]) : text === "NEW_LEAVE_REQUEST_MANAGER" ? "/?section=leaveRequests" : null;
}
