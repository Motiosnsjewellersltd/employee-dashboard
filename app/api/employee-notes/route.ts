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
      floor: true
    }
  },

  createdBy: {
    select: {
      id: true,
      employeeCode: true,
      name: true,
      role: true,
      floor: true,
      isFloorManager: true
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
      floor: true,
      isFloorManager: true
    }
  });
}


/* =========================================================
   GET NOTES
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
      Can view all employee notes.
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
      FLOOR MANAGER
      Can view notes only for employees
      belonging to the same floor.
    */
    else if (
      actor.role === "EMPLOYEE" &&
      actor.isFloorManager &&
      actor.floor
    ) {
      where.employee = {
        floor: actor.floor,
        deletedAt: null
      };

      if (requestedEmployeeId) {
        const employee =
          await prisma.employee.findFirst({
            where: {
              id: requestedEmployeeId,
              deletedAt: null
            },

            select: {
              id: true,
              floor: true
            }
          });

        if (!employee) {
          throw new Error(
            "Employee not found."
          );
        }

        if (
          employee.floor !==
          actor.floor
        ) {
          throw new Error(
            "You can only view notes for employees on your own floor."
          );
        }

        where.employeeId =
          requestedEmployeeId;
      }
    }

    /*
      NORMAL EMPLOYEE
      Can see only own notes.
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
   CREATE NOTE
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

    if (note.length > 3000) {
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
          floor: true
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

    const isFloorManager =
      actor.role === "EMPLOYEE" &&
      actor.isFloorManager === true;

    /*
      Only:
      ADMIN
      HR
      Floor Manager

      can create notes.
    */
    if (
      !isAdminOrHr &&
      !isFloorManager
    ) {
      throw new Error(
        "You are not allowed to add employee notes."
      );
    }

    /*
      Floor Manager can only add notes
      to employees on the same floor.
    */
    if (
      isFloorManager &&
      !isAdminOrHr
    ) {
      if (!actor.floor) {
        throw new Error(
          "Floor is not assigned to this Floor Manager."
        );
      }

      if (
        target.floor !== actor.floor
      ) {
        throw new Error(
          "Floor Manager can only add notes for employees on the same floor."
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

        floor:
          target.floor,

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
   DELETE NOTE
   ========================================================= */

export async function DELETE(
  req: NextRequest
) {
  try {
    const session =
      await requireSession();

    /*
      Floor Manager cannot delete.
      Employee cannot delete.

      Only ADMIN / HR.
    */
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