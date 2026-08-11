import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/utils";
import { addAuditLog } from "@/lib/audit";
import { cleanupRecycleBin, RECYCLE_RETENTION_DAYS } from "@/lib/recycleBin";

function requireAdminOrHr(role: string) {
  if (!["ADMIN", "HR"].includes(role)) throw new Error("Only Admin/HR allowed.");
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    requireAdminOrHr(session.role);
    const cleanup = await cleanupRecycleBin();
    const type = String(new URL(req.url).searchParams.get("type") || "all").toLowerCase();

    const employees = type === "all" || type === "employees"
      ? await prisma.employee.findMany({
          where: { deletedAt: { not: null } },
          select: { id: true, name: true, mobile: true, designation: true, department: true, role: true, deletedAt: true, deletedById: true, deletedByName: true },
          orderBy: { deletedAt: "desc" }
        })
      : [];

    const leaves = type === "all" || type === "leaves"
      ? await prisma.leaveRecord.findMany({
          where: { deletedAt: { not: null } },
          include: { employee: { select: { id: true, name: true, mobile: true, deletedAt: true } } },
          orderBy: { deletedAt: "desc" }
        })
      : [];

    return ok({ employees, leaves, retentionDays: RECYCLE_RETENTION_DAYS, autoCleaned: cleanup });
  } catch (e) {
    return fail(e, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    requireAdminOrHr(session.role);
    await cleanupRecycleBin();
    const body = await req.json();
    const type = String(body.type || "").toLowerCase();
    const action = String(body.action || "").toUpperCase();
    const id = String(body.id || "").trim();
    if (!id) throw new Error("Recycle Bin record id required.");

    if (type === "employee") {
      const employee = await prisma.employee.findFirst({ where: { id, deletedAt: { not: null } } });
      if (!employee) throw new Error("Deleted employee not found.");

      if (action === "RESTORE") {
        const conflict = await prisma.employee.findFirst({
          where: { id: { not: id }, mobile: employee.mobile, deletedAt: null },
          select: { id: true, name: true, mobile: true }
        });
        if (conflict) return fail(new Error(`Restore conflict: mobile ${employee.mobile} is already used by ${conflict.name}.`), 409);
        await prisma.employee.update({ where: { id }, data: { deletedAt: null, deletedById: null, deletedByName: null } });
        await addAuditLog({ actorId: session.id, actorName: session.name, action: "RESTORE_EMPLOYEE", target: employee.name, details: { id } });
        return ok({ restored: 1 });
      }

      if (action === "PERMANENT_DELETE") {
        await prisma.employee.delete({ where: { id } });
        await addAuditLog({ actorId: session.id, actorName: session.name, action: "PERMANENT_DELETE_EMPLOYEE", target: employee.name, details: { id } });
        return ok({ deleted: 1 });
      }
    }

    if (type === "leave") {
      const leave = await prisma.leaveRecord.findFirst({
        where: { id, deletedAt: { not: null } },
        include: { employee: { select: { id: true, name: true, deletedAt: true } } }
      });
      if (!leave) throw new Error("Deleted leave record not found.");

      if (action === "RESTORE") {
        if (leave.employee.deletedAt) return fail(new Error(`Restore conflict: ${leave.employee.name} is in Recycle Bin. Restore the employee first.`), 409);
        const conflict = await prisma.leaveRecord.findFirst({
          where: { id: { not: id }, employeeId: leave.employeeId, monthYear: leave.monthYear, deletedAt: null },
          select: { id: true }
        });
        if (conflict) return fail(new Error(`Restore conflict: an active leave record already exists for ${leave.employee.name} in ${leave.monthYear}.`), 409);
        await prisma.leaveRecord.update({ where: { id }, data: { deletedAt: null, deletedById: null, deletedByName: null } });
        await addAuditLog({ actorId: session.id, actorName: session.name, action: "RESTORE_LEAVE", target: leave.employee.name, details: { monthYear: leave.monthYear, leave: leave.leave } });
        return ok({ restored: 1 });
      }

      if (action === "PERMANENT_DELETE") {
        await prisma.leaveRecord.delete({ where: { id } });
        await addAuditLog({ actorId: session.id, actorName: session.name, action: "PERMANENT_DELETE_LEAVE", target: leave.employee.name, details: { monthYear: leave.monthYear, leave: leave.leave } });
        return ok({ deleted: 1 });
      }
    }

    throw new Error("Invalid Recycle Bin action.");
  } catch (e) {
    return fail(e);
  }
}
