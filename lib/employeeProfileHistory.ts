export const historyFields: Record<string, string> = {
  employeeCode: "Employee ID", name: "Name", mobile: "Mobile", dob: "Date of Birth", doj: "Joining Date", exitDate: "Exit Date",
  designation: "Designation", department: "Department", branch: "Branch", floor: "Floor", role: "Role", status: "Status",
  isFloorManager: "Manager / Head", managerScope: "Manager Scope", photoUrl: "Profile Photo"
};
export type ProfileChange = { field: string; label: string; before: string; after: string };
function value(input: unknown) {
  return input instanceof Date ? input.toISOString().slice(0, 10) : input == null ? "" : String(input);
}
export function profileHistoryChanges(before: Record<string, unknown>, after: Record<string, unknown>): ProfileChange[] {
  return Object.entries(historyFields).filter(([key]) => key in before && key in after && value(before[key]) !== value(after[key]))
    .map(([field, label]) => ({ field, label, before: field === "photoUrl" ? (before[field] ? "Previous photo" : "No photo") : value(before[field]),
      after: field === "photoUrl" ? (after[field] ? "Photo updated" : "Photo removed") : value(after[field]) }));
}
export function safeHistoryChanges(details: unknown): ProfileChange[] {
  if (!details || typeof details !== "object" || !Array.isArray((details as { changes?: unknown }).changes)) return [];
  return ((details as { changes: unknown[] }).changes).filter((row): row is ProfileChange => {
    if (!row || typeof row !== "object") return false;
    const item = row as ProfileChange;
    return Object.hasOwn(historyFields, item.field) && typeof item.before === "string" && typeof item.after === "string";
  }).map(row => ({ field: row.field, label: historyFields[row.field], before: row.before.slice(0, 1000), after: row.after.slice(0, 1000) }));
}
