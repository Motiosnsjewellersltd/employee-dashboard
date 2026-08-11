import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { employeeSelect, fail, ok, parseDate } from "@/lib/utils";
import { addAuditLog } from "@/lib/audit";
import { addSystemNotification } from "@/lib/systemNotification";

export async function GET(_: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    if (session.role === "EMPLOYEE" && session.id !== id) throw new Error("Unauthorized");
    const employee = await prisma.employee.findFirst({ where: { id, deletedAt: null } });
    if (!employee) throw new Error("Employee not found.");
    return ok({ employee: employeeSelect(employee) });
  } catch (e) { return fail(e, 401); }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    if (!["ADMIN", "HR"].includes(session.role)) throw new Error("Only Admin/HR allowed.");
    const { id } = await ctx.params;
    const data = await req.json();
    const before = await prisma.employee.findFirst({ where: { id, deletedAt: null }, select: { status: true } });
    if (!before) throw new Error("Employee not found.");
    const update: any = {
      name: String(data.name || "").trim(),
      mobile: String(data.mobile || "").trim(),
      role: data.role || "EMPLOYEE",
      designation: data.designation || "",
      department: data.department || "",
      dob: parseDate(data.dob),
      doj: parseDate(data.doj),
      exitDate: parseDate(data.exitDate),
      status: data.status || "ACTIVE"
    };
    if (data.password) update.password = await bcrypt.hash(String(data.password), 10);
    const employee = await prisma.employee.update({ where: { id }, data: update });
    await addAuditLog({ actorId: session.id, actorName: session.name, action: data.password ? "RESET_PASSWORD_OR_UPDATE_EMPLOYEE" : "UPDATE_EMPLOYEE", target: employee.name, details: { mobile: employee.mobile, designation: employee.designation, department: employee.department, status: employee.status } });
    if (before.status !== employee.status) {
      await addSystemNotification({
        actorId: session.id,
        action: employee.status === "INACTIVE" ? "DEACTIVATE_EMPLOYEE" : "ACTIVATE_EMPLOYEE",
        text: `Employee ${employee.status === "INACTIVE" ? "deactivated" : "activated"}: ${employee.name} by ${session.name}.`,
        type: employee.status === "INACTIVE" ? "NOTICE" : "INFORMATION"
      });
    }
    return ok({ employee: employeeSelect(employee) });
  } catch (e) { return fail(e); }
}

export async function DELETE(_: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    if (!["ADMIN", "HR"].includes(session.role)) throw new Error("Only Admin/HR allowed.");
    const { id } = await ctx.params;
    if (session.id === id) throw new Error("Self delete not allowed.");
    const employee = await prisma.employee.findFirst({ where: { id, deletedAt: null } });
    if (!employee) throw new Error("Employee not found.");
    const deletedAt = new Date();
    await prisma.employee.update({ where: { id }, data: { deletedAt, deletedById: session.id, deletedByName: session.name } });
    await addAuditLog({ actorId: session.id, actorName: session.name, action: "DELETE_EMPLOYEE", target: employee.name, details: { id, softDelete: true, deletedAt } });
    await addSystemNotification({
      actorId: session.id,
      action: "DELETE_EMPLOYEE",
      text: `Employee moved to Recycle Bin: ${employee.name} by ${session.name}.`,
      type: "NOTICE"
    });
    return ok({ recycled: 1 });
  } catch (e) { return fail(e); }
}
