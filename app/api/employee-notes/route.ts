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
      floor: true
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
      branch: true,
      floor: true,
      isFloorManager: true
    }
  });
}

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

    if (
      session.role === "ADMIN" ||
      session.role === "HR"
    ) {
      if (requestedEmployeeId) {
        where.employeeId =
          requestedEmployeeId;
      }
    }

    else if (
      actor.role === "EMPLOYEE" &&
      actor.isFloorManager &&
      actor.branch &&
      actor.floor
    ) {
      where.employee = {
        branch: actor.branch,
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
              branch: true,
              floor: true
            }
          });

        if (!employee) {
          throw new Error(
            "Employee not found."
          );
        }

        if (
          employee.branch !== actor.branch ||
          employee.floor !== actor.floor
        ) {
          throw new Error(
            "You can only view notes for employees in your own branch and floor."
          );
        }

        where.employeeId =
          requestedEmployeeId;
      }
    }

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
          branch: true,
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

    if (
      !isAdminOrHr &&
      !isFloorManager
    ) {
      throw new Error(
        "You are not allowed to add employee notes."
      );
    }

    if (
      isFloorManager &&
      !isAdminOrHr
    ) {
      if (!actor.branch) {
        throw new Error(
          "Branch is not assigned to this Floor Manager."
        );
      }

      if (!actor.floor) {
        throw new Error(
          "Floor is not assigned to this Floor Manager."
        );
      }

      if (
        target.branch !== actor.branch ||
        target.floor !== actor.floor
      ) {
        throw new Error(
          "Floor Manager can only add notes for employees in the same branch and floor."
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