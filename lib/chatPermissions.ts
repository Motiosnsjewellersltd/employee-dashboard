import { prisma } from "@/lib/prisma";
import { permissionDefaults } from "@/lib/permissions";

function sameText(a?: string | null, b?: string | null) {
  return String(a || "").trim().toUpperCase() === String(b || "").trim().toUpperCase();
}

function managerCoversEmployee(manager: any, employee: any) {
  if (!manager?.isFloorManager) return false;
  const scope = String(manager.managerScope || "FLOOR").toUpperCase();
  if (scope === "DEPARTMENT") return Boolean(manager.department) && sameText(manager.department, employee.department);
  if (scope === "BRANCH") return Boolean(manager.branch) && sameText(manager.branch, employee.branch);
  return Boolean(manager.branch) && Boolean(manager.floor) && sameText(manager.branch, employee.branch) && sameText(manager.floor, employee.floor);
}

async function employeePeerChatAllowed() {
  const row = await (prisma as any).permissionSetting.findUnique({ where: { key: "employeePeerChatAllowed" } }).catch(() => null);
  return String(row?.value ?? permissionDefaults.employeePeerChatAllowed ?? "false") === "true";
}

export async function canChatBetween(userAId: string, userBId: string) {
  if (!userAId || !userBId || userAId === userBId) return false;

  const [a, b, peerAllowed] = await Promise.all([
    prisma.employee.findFirst({ where: { id: userAId, status: "ACTIVE", deletedAt: null, exitDate: null } }),
    prisma.employee.findFirst({ where: { id: userBId, status: "ACTIVE", deletedAt: null, exitDate: null } }),
    employeePeerChatAllowed()
  ]);

  if (!a || !b) return false;

  // HR/Admin can chat with everyone.
  if (["ADMIN", "HR"].includes(a.role) || ["ADMIN", "HR"].includes(b.role)) return true;

  const aManager = Boolean(a.isFloorManager);
  const bManager = Boolean(b.isFloorManager);

  // Team Head / Floor Manager can chat only with their own team (plus HR/Admin handled above).
  if (aManager && !bManager) return managerCoversEmployee(a, b);
  if (bManager && !aManager) return managerCoversEmployee(b, a);
  if (aManager && bManager) return false;

  // Normal employee-to-employee chat is controlled by Admin and stays same-department only.
  if (!peerAllowed) return false;
  return Boolean(a.department) && sameText(a.department, b.department);
}

export async function allowedChatEmployeeIds(currentEmployeeId: string, candidateIds: string[]) {
  const uniqueIds = Array.from(new Set(candidateIds.filter(id => id && id !== currentEmployeeId)));
  const results = await Promise.all(uniqueIds.map(async id => [id, await canChatBetween(currentEmployeeId, id)] as const));
  return new Set(results.filter(([, allowed]) => allowed).map(([id]) => id));
}

export async function assertChatAllowed(userAId: string, userBId: string) {
  if (!(await canChatBetween(userAId, userBId))) {
    throw new Error("Chat is not allowed between these employees.");
  }
}

export async function getOtherParticipantId(threadId: string, selfId: string) {
  const participants = await prisma.chatParticipant.findMany({ where: { threadId }, select: { employeeId: true } });
  return participants.find(p => p.employeeId !== selfId)?.employeeId || "";
}
