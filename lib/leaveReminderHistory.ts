export const reminderHistoryKinds = {
  LEAVE_MANAGER_REMINDER: "Manager / Head reminder",
  LEAVE_MANAGER_PENDING_24H: "HR alert — Manager pending 24 hours",
  LEAVE_STARTING_SOON: "Urgent — Leave starting soon"
} as const;
export function reminderHistoryEntry(value: string | null) {
  const match = /^(LEAVE_MANAGER_REMINDER|LEAVE_MANAGER_PENDING_24H|LEAVE_STARTING_SOON):([a-zA-Z0-9_-]{1,100})(?::\d+)?$/.exec(value || "");
  return match ? { requestId: match[2], type: reminderHistoryKinds[match[1] as keyof typeof reminderHistoryKinds] } : null;
}
export function reminderHistoryWhere(requestIds: string[]) {
  return { filterType: "SYSTEM", OR: [
    { filterValue: { in: requestIds.flatMap(id => Object.keys(reminderHistoryKinds).map(kind => `${kind}:${id}`)) } },
    ...requestIds.map(id => ({ filterValue: { startsWith: `LEAVE_MANAGER_REMINDER:${id}:` } }))
  ] };
}
export function summarizeReminderHistory(requestIds: string[], groups: Array<{ filterValue: string | null; _count: { _all: number }; _max: { createdAt: Date | null } }>) {
  const summaries: Record<string, { count: number; lastAt: string | null }> = Object.fromEntries(requestIds.map(id => [id, { count: 0, lastAt: null }]));
  for (const group of groups) {
    const entry = reminderHistoryEntry(group.filterValue);
    if (!entry || !Object.prototype.hasOwnProperty.call(summaries, entry.requestId)) continue;
    const summary = summaries[entry.requestId];
    summary.count += group._count._all;
    const time = group._max.createdAt?.toISOString();
    if (time && (!summary.lastAt || time > summary.lastAt)) summary.lastAt = time;
  }
  return summaries;
}
