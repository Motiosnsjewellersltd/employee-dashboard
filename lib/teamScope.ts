import { prisma } from "@/lib/prisma";

export async function getManagerRecord(employeeId: string) {
  return prisma.employee.findFirst({
    where: { id: employeeId, deletedAt: null },
    select: {
      id: true,
      name: true,
      role: true,
      branch: true,
      floor: true,
      department: true,
      isFloorManager: true,
      managerScope: true,
      status: true
    }
  });
}

export function buildManagerTeamWhere(manager: any) {
  if (!manager || manager.role !== "EMPLOYEE" || !manager.isFloorManager || !manager.managerScope) {
    return null;
  }

  const commonWhere: any = {
    id: { not: manager.id },
    status: "ACTIVE",
    exitDate: null,
    deletedAt: null,
    role: { not: "ADMIN" }
  };

  if (manager.managerScope === "FLOOR") {
    if (!manager.branch || !manager.floor) return null;
    return { ...commonWhere, branch: manager.branch, floor: manager.floor };
  }

  if (manager.managerScope === "BRANCH") {
    if (!manager.branch) return null;
    return {
      ...commonWhere,
      branch: manager.branch,
      floor: { in: ["Diamond", "Gold", "Silver"] }
    };
  }

  if (manager.managerScope === "DEPARTMENT") {
    if (!manager.department) return null;
    return { ...commonWhere, department: manager.department };
  }

  return null;
}

export async function getManagerTeamEmployeeIds(manager: any) {
  const where = buildManagerTeamWhere(manager);
  if (!where) return [];
  const rows = await prisma.employee.findMany({ where, select: { id: true } });
  return rows.map(row => row.id);
}

export async function canManagerAccessEmployee(managerId: string, employeeId: string) {
  const manager = await getManagerRecord(managerId);
  const where = buildManagerTeamWhere(manager);
  if (!where) return false;
  const employee = await prisma.employee.findFirst({
    where: { ...where, id: employeeId },
    select: { id: true }
  });
  return Boolean(employee);
}

export async function findManagersForEmployee(employee: {
  id: string;
  branch?: string | null;
  floor?: string | null;
  department?: string | null;
}) {
  const candidates = await prisma.employee.findMany({
    where: {
      id: { not: employee.id },
      role: "EMPLOYEE",
      status: "ACTIVE",
      exitDate: null,
      deletedAt: null,
      isFloorManager: true,
      managerScope: { in: ["FLOOR", "BRANCH", "DEPARTMENT"] }
    },
    select: {
      id: true,
      name: true,
      branch: true,
      floor: true,
      department: true,
      managerScope: true
    }
  });

  return candidates.filter(manager => {
    if (manager.managerScope === "FLOOR") {
      return Boolean(employee.branch && employee.floor && manager.branch === employee.branch && manager.floor === employee.floor);
    }
    if (manager.managerScope === "BRANCH") {
      return Boolean(
        employee.branch &&
        manager.branch === employee.branch &&
        ["Diamond", "Gold", "Silver"].includes(String(employee.floor || ""))
      );
    }
    if (manager.managerScope === "DEPARTMENT") {
      return Boolean(employee.department && manager.department === employee.department);
    }
    return false;
  });
}
