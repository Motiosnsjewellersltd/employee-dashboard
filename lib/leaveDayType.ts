// Keep legacy HALF values readable without guessing which half was requested.
export function isHalfDay(value: string) {
  return value === "HALF" || value === "HALF_FIRST" || value === "HALF_SECOND";
}
export function leaveDayTypeLabel(value: string) {
  if (value === "HALF_FIRST") return "First Half (Morning)";
  if (value === "HALF_SECOND") return "Second Half (Evening)";
  if (value === "HALF") return "Half Day — Time not specified";
  return "Full Day";
}
export function leaveHalfDetails(from: string, to: string, fromType: string, toType: string) {
  if (from === to) return isHalfDay(fromType) ? ` (${leaveDayTypeLabel(fromType)})` : "";
  const details = [];
  if (isHalfDay(fromType)) details.push(`${from}: ${leaveDayTypeLabel(fromType)}`);
  if (isHalfDay(toType)) details.push(`${to}: ${leaveDayTypeLabel(toType)}`);
  return details.length ? ` (${details.join("; ")})` : "";
}
