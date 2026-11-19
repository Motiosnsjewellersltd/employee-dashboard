import { prisma } from "@/lib/prisma";
import { isOverdueLeave, leaveWaitingStage, managerMatchesEmployee } from "@/lib/leaveWorkflow";
export async function leaveWorkflowReview<T extends { status: string; managerStatus: string; toDate: Date; createdAt: Date; managerDecidedAt: Date | null; requester: { id: string; branch: string | null; floor: string | null; department: string | null; isFloorManager: boolean } }>(requests: T[]) {
  const now = new Date();
  if (!requests.some(row => row.status === "PENDING")) return requests;
  const [people, hrMenu, hrReview] = await Promise.all([
    prisma.employee.findMany({ where: { status: "ACTIVE", deletedAt: null, exitDate: null, OR: [{ role: { in: ["ADMIN", "HR"] } }, { role: "EMPLOYEE", isFloorManager: true }, { employeeCode: "7222" }, { mobile: "9461093869" }, { name: { equals: "Cheshta Malik", mode: "insensitive" } }] }, select: { id: true, name: true, role: true, employeeCode: true, mobile: true, isFloorManager: true, managerScope: true, branch: true, floor: true, department: true } }),
    prisma.permissionSetting.findUnique({ where: { key: "hrMenuLeaveRequests" }, select: { value: true } }),
    prisma.permissionSetting.findUnique({ where: { key: "hrCanReviewLeaveRequests" }, select: { value: true } })
  ]);
  const staff = people.filter(person => person.role === "ADMIN" || (person.role === "HR" && (hrMenu?.value ?? "true") === "true" && (hrReview?.value ?? "true") === "true"));
  return requests.map(row => {
    const stage = leaveWaitingStage(row);
    if (!stage) return { ...row, overdue: false, waiting: null };
    const designing = (row.requester.department || "").trim().toUpperCase() === "DESIGNING";
    const managers = designing
      ? people.filter(person => person.id !== row.requester.id && (person.employeeCode === "7222" || person.mobile === "9461093869" || person.name.toLowerCase() === "cheshta malik")).slice(0, 1)
      : row.requester.isFloorManager ? [] : people.filter(person => person.role === "EMPLOYEE" && person.isFloorManager && managerMatchesEmployee(person, row.requester));
    const owners = row.managerStatus === "APPROVED" ? staff : managers;
    return { ...row, overdue: isOverdueLeave(row, now), waiting: { ...stage, owners: owners.map(person => person.name) } };
  });
}
