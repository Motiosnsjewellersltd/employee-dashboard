import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { addAuditLog } from "@/lib/audit";
import { fail, ok } from "@/lib/utils";

const noteInclude = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      name: true,
      branch: true,
      floor: true,
      department: true
    }
  },

  createdBy: {
    select: {
      id: true,
      employeeCode: true,
      name: true,
      role: true,
      branch: true,
      floor: true,
      department: true,
      isFloorManager: true,
      managerScope: true
    }
  }
};

async function getCurrentEmployee(
  sessionId: string
) {
  return prisma.employee.findFirst({
    where: {
      id: sessionId,
      deletedAt: null
    },

    select: {
      id: true,
      name: true,
      role: true,
      branch: true,
      floor: true,
      department: true,
      isFloorManager: true,
      managerScope: true
    }
  });
}

function managerEmployeeAllowed(
  manager: {
    branch?: string | null;
    floor?: string | null;
    department?: string | null;
    managerScope?: string | null;
  },
  employee: {
    branch?: string | null;
    floor?: string | null;
    department?: string | null;
  }
) {
  if (
    manager.managerScope === "FLOOR"
  ) {
    return (
      Boolean(manager.branch) &&
      Boolean(manager.floor) &&
      employee.branch === manager.branch &&
      employee.floor === manager.floor
    );
  }

  if (
    manager.managerScope === "BRANCH"
  ) {
    return (
      Boolean(manager.branch) &&
      employee.branch === manager.branch &&
      [
        "Diamond",
        "Gold",
        "Silver"
      ].includes(
        String(employee.floor || "")
      )
    );
  }

  if (
    manager.managerScope === "DEPARTMENT"
  ) {
    return (
      Boolean(manager.department) &&
      employee.department ===
        manager.department
    );
  }

  return false;
}

function managerEmployeeWhere(
  manager: {
    branch?: string | null;
    floor?: string | null;
    department?: string | null;
    managerScope?: string | null;
  }
) {
  if (
    manager.managerScope === "FLOOR"
  ) {
    if (
      !manager.branch ||
      !manager.floor
    ) {
      throw new Error(
        "Branch and Floor are required for Specific Floor Manager."
      );
    }

    return {
      branch: manager.branch,
      floor: manager.floor,
      deletedAt: null
    };
  }

  if (
    manager.managerScope === "BRANCH"
  ) {
    if (!manager.branch) {
      throw new Error(
        "Branch is required for Whole Branch Manager."
      );
    }

    return {
      branch: manager.branch,

      floor: {
        in: [
          "Diamond",
          "Gold",
          "Silver"
        ]
      },

      deletedAt: null
    };
  }

  if (
    manager.managerScope === "DEPARTMENT"
  ) {
    if (!manager.department) {
      throw new Error(
        "Department is required for Department / Function Head."
      );
    }

    return {
      department:
        manager.department,

      deletedAt: null
    };
  }

  throw new Error(
    "Invalid Manager Scope."
  );
}


/* =========================================================
   GET
   ========================================================= */

export async function GET(
  req: NextRequest
) {
  try {
    const session =
      await requireSession();

    const actor =
      await getCurrentEmployee(
        session.id
      );

    if (!actor) {
      throw new Error(
        "Employee not found."
      );
    }

    const params =
      new URL(req.url)
        .searchParams;

    const requestedEmployeeId =
      String(
        params.get("employeeId") || ""
      ).trim();

    let where: any = {};

    /*
      ADMIN / HR
    */
    if (
      session.role === "ADMIN" ||
      session.role === "HR"
    ) {
      if (requestedEmployeeId) {
        where.employeeId =
          requestedEmployeeId;
      }
    }

    /*
      MANAGER / HEAD
    */
    else if (
      actor.role === "EMPLOYEE" &&
      actor.isFloorManager
    ) {
      where.employee =
        managerEmployeeWhere(actor);

      if (requestedEmployeeId) {
        const employee =
          await prisma.employee.findFirst({
            where: {
              id: requestedEmployeeId,
              deletedAt: null
            },

            select: {
              id: true,
              branch: true,
              floor: true,
              department: true
            }
          });

        if (!employee) {
          throw new Error(
            "Employee not found."
          );
        }

        if (
          !managerEmployeeAllowed(
            actor,
            employee
          )
        ) {
          throw new Error(
            "You can only view notes for employees within your assigned manager scope."
          );
        }

        where.employeeId =
          requestedEmployeeId;
      }
    }

    /*
      NORMAL EMPLOYEE
    */
    else {
      where.employeeId =
        session.id;
    }

    const notes =
      await prisma.employeeNote.findMany({
        where,

        include: noteInclude,

        orderBy: {
          createdAt: "desc"
        },

        take: 2000
      });

    return ok({
      notes
    });

  } catch (error) {
    return fail(error, 401);
  }
}


/* =========================================================
   POST
   ========================================================= */

export async function POST(
  req: NextRequest
) {
  try {
    const session =
      await requireSession();

    const actor =
      await getCurrentEmployee(
        session.id
      );

    if (!actor) {
      throw new Error(
        "Employee not found."
      );
    }

    const body =
      await req.json();

    const employeeId =
      String(
        body.employeeId || ""
      ).trim();

    const note =
      String(
        body.note || ""
      ).trim();

    if (!employeeId) {
      throw new Error(
        "Select employee."
      );
    }

    if (!note) {
      throw new Error(
        "Note is required."
      );
    }

    if (
      note.length > 3000
    ) {
      throw new Error(
        "Note must be 3000 characters or less."
      );
    }

    const target =
      await prisma.employee.findFirst({
        where: {
          id: employeeId,
          deletedAt: null
        },

        select: {
          id: true,
          employeeCode: true,
          name: true,
          branch: true,
          floor: true,
          department: true
        }
      });

    if (!target) {
      throw new Error(
        "Employee not found."
      );
    }

    const isAdminOrHr =
      session.role === "ADMIN" ||
      session.role === "HR";

    const isManager =
      actor.role === "EMPLOYEE" &&
      actor.isFloorManager === true;

    if (
      !isAdminOrHr &&
      !isManager
    ) {
      throw new Error(
        "You are not allowed to add employee notes."
      );
    }

    if (
      isManager &&
      !isAdminOrHr
    ) {
      if (
        !managerEmployeeAllowed(
          actor,
          target
        )
      ) {
        throw new Error(
          "You can only add notes for employees within your assigned manager scope."
        );
      }
    }

    const created =
      await prisma.employeeNote.create({
        data: {
          employeeId,

          note,

          createdById:
            session.id,

          createdByName:
            session.name,

          createdByRole:
            session.role
        },

        include: noteInclude
      });

    await addAuditLog({
      actorId:
        session.id,

      actorName:
        session.name,

      action:
        "CREATE_EMPLOYEE_NOTE",

      target:
        target.name,

      details: {
        employeeId:
          target.id,

        employeeCode:
          target.employeeCode,

        employeeName:
          target.name,

        branch:
          target.branch,

        floor:
          target.floor,

        department:
          target.department,

        managerScope:
          actor.managerScope,

        noteId:
          created.id
      }
    });

    return ok({
      note: created
    });

  } catch (error) {
    return fail(error);
  }
}


/* =========================================================
   DELETE
   ========================================================= */

export async function DELETE(
  req: NextRequest
) {
  try {
    const session =
      await requireSession();

    if (
      session.role !== "ADMIN" &&
      session.role !== "HR"
    ) {
      throw new Error(
        "Only Admin/HR can delete employee notes."
      );
    }

    const params =
      new URL(req.url)
        .searchParams;

    const id =
      String(
        params.get("id") || ""
      ).trim();

    if (!id) {
      throw new Error(
        "Note is required."
      );
    }

    const current =
      await prisma.employeeNote.findUnique({
        where: {
          id
        },

        include: noteInclude
      });

    if (!current) {
      throw new Error(
        "Note not found."
      );
    }

    await prisma.employeeNote.delete({
      where: {
        id
      }
    });

    await addAuditLog({
      actorId:
        session.id,

      actorName:
        session.name,

      action:
        "DELETE_EMPLOYEE_NOTE",

      target:
        current.employee.name,

      details: {
        noteId:
          current.id,

        employeeId:
          current.employeeId,

        employeeName:
          current.employee.name,

        originalCreatedBy:
          current.createdByName,

        originalCreatedByRole:
          current.createdByRole,

        originalCreatedAt:
          current.createdAt
      }
    });

    return ok({
      deleted: true
    });

  } catch (error) {
    return fail(error);
  }
}