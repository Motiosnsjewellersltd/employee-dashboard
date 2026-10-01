import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/utils";

export async function GET() {
  try {
    const session = await requireSession();

    const manager = await prisma.employee.findFirst({
      where: {
        id: session.id,
        deletedAt: null
      },

      select: {
        id: true,
        employeeCode: true,
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

    if (!manager) {
      throw new Error("Employee not found.");
    }

    if (
      manager.role !== "EMPLOYEE" ||
      !manager.isFloorManager
    ) {
      throw new Error(
        "Team is only available for Managers / Heads."
      );
    }

    if (!manager.managerScope) {
      throw new Error(
        "Manager Scope is not assigned."
      );
    }

    const commonWhere = {
      id: {
        not: manager.id
      },

      status: "ACTIVE" as const,

      exitDate: null,

      deletedAt: null,

      role: {
        not: "ADMIN" as const
      }
    };

    let teamWhere: any = {
      ...commonWhere
    };

    if (manager.managerScope === "FLOOR") {
      if (!manager.branch) {
        throw new Error(
          "Branch is not assigned to this Manager."
        );
      }

      if (!manager.floor) {
        throw new Error(
          "Floor is not assigned to this Manager."
        );
      }

      teamWhere = {
        ...commonWhere,
        branch: manager.branch,
        floor: manager.floor
      };
    }

    else if (manager.managerScope === "BRANCH") {
      if (!manager.branch) {
        throw new Error(
          "Branch is not assigned to this Manager."
        );
      }

      teamWhere = {
        ...commonWhere,
        branch: manager.branch,

        floor: {
          in: [
            "Diamond",
            "Gold",
            "Silver"
          ]
        }
      };
    }

    else if (
      manager.managerScope === "DEPARTMENT"
    ) {
      if (!manager.department) {
        throw new Error(
          "Department is not assigned to this Manager / Head."
        );
      }

      teamWhere = {
        ...commonWhere,
        department: manager.department
      };
    }

    else {
      throw new Error(
        "Invalid Manager Scope."
      );
    }

    const employees =
      await prisma.employee.findMany({
        where: teamWhere,

        select: {
          id: true,
          employeeCode: true,
          name: true,
          mobile: true,
          role: true,
          designation: true,
          department: true,
          branch: true,
          floor: true,
          isFloorManager: true,
          managerScope: true,
          status: true,
          photoUrl: true,
          doj: true,
          updatedAt: true
        },

        orderBy: {
          name: "asc"
        }
      });

    return ok({
      managerScope:
        manager.managerScope,

      branch:
        manager.branch || "",

      floor:
        manager.floor || "",

      department:
        manager.department || "",

      manager: {
        id: manager.id,
        employeeCode:
          manager.employeeCode,
        name:
          manager.name,
        branch:
          manager.branch,
        floor:
          manager.floor,
        department:
          manager.department,
        managerScope:
          manager.managerScope
      },

      employees
    });

  } catch (error) {
    return fail(error, 401);
  }
}