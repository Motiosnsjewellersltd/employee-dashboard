import { leaveStartInIndia } from "@/lib/leaveReminderRules";
type RequestState = { status: string; managerStatus: string; toDate: Date | string; createdAt: Date | string; managerDecidedAt?: Date | string | null };
export function isOverdueLeave(request: Pick<RequestState, "status" | "toDate">, now = new Date()) {
  const end = leaveStartInIndia(request.toDate) + 86400000;
  return request.status === "PENDING" && Number.isFinite(end) && now.getTime() >= end;
}
export function leaveWaitingStage(request: RequestState) {
  if (request.status !== "PENDING") return null;
  return request.managerStatus === "APPROVED"
    ? { stage: "HR / Admin", since: request.managerDecidedAt || request.createdAt, next: "Final HR / Admin decision" }
    : { stage: "Manager / Head", since: request.createdAt, next: "HR / Admin after manager approval" };
}
export function managerMatchesEmployee(manager: { id: string; managerScope: string | null; branch: string | null; floor: string | null; department: string | null }, employee: { id: string; branch?: string | null; floor?: string | null; department?: string | null }) {
  if (manager.id === employee.id) return false;
  if (manager.managerScope === "FLOOR") return Boolean(employee.branch && employee.floor && manager.branch === employee.branch && manager.floor === employee.floor);
  if (manager.managerScope === "BRANCH") return Boolean(employee.branch && manager.branch === employee.branch && ["Diamond", "Gold", "Silver"].includes(employee.floor || ""));
  if (manager.managerScope === "DEPARTMENT") return Boolean(employee.department && manager.department === employee.department);
  return false;
}
