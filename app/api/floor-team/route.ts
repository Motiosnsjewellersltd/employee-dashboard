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
        isFloorManager: true,
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
        "Floor Team is only available for Floor Managers."
      );
    }

    if (!manager.branch) {
      throw new Error(
        "Branch is not assigned to this Floor Manager."
      );
    }

    if (!manager.floor) {
      throw new Error(
        "Floor is not assigned to this Floor Manager."
      );
    }

    const employees = await prisma.employee.findMany({
      where: {
        branch: manager.branch,
        floor: manager.floor,
        deletedAt: null,
        role: {
          not: "ADMIN"
        }
      },

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
      branch: manager.branch,
      floor: manager.floor,

      manager: {
        id: manager.id,
        employeeCode: manager.employeeCode,
        name: manager.name,
        branch: manager.branch,
        floor: manager.floor
      },

      employees
    });
  } catch (error) {
    return fail(error, 401);
  }
}