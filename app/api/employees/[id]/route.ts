import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { employeeSelect, fail, ok, parseDate } from "@/lib/utils";
import { addAuditLog } from "@/lib/audit";
import { addSystemNotification } from "@/lib/systemNotification";
import { requireHrPermission } from "@/lib/permissions";

function cleanBranch(value: unknown) {
  const branch = String(value || "").trim().toUpperCase();
  if (!branch) return null;
  if (!["MT", "JB", "VN"].includes(branch)) throw new Error("Branch must be MT, JB or VN.");
  return branch;
}

function cleanEmployeeCode(value: unknown) {
  const employeeCode = String(value || "").trim();
  if (!employeeCode) return null;
  if (!/^\d+$/.test(employeeCode)) throw new Error("Employee ID must contain numbers only.");
  return employeeCode;
}

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
    if (data.passwordOnly) {
      await requireHrPermission(session.role, "hrCanResetPassword", "HR is not allowed to reset passwords.");
      if (!String(data.password || "").trim()) throw new Error("New password is required.");
      const employee = await prisma.employee.update({ where: { id }, data: { password: await bcrypt.hash(String(data.password), 10) } });
      await addAuditLog({ actorId: session.id, actorName: session.name, action: "RESET_PASSWORD", target: employee.name, details: { id } });
      return ok({ employee: employeeSelect(employee) });
    }
    await requireHrPermission(session.role, "hrCanEditEmployee", "HR is not allowed to edit employees.");
    if (data.password) await requireHrPermission(session.role, "hrCanResetPassword", "HR is not allowed to reset passwords.");
    const before = await prisma.employee.findFirst({ where: { id, deletedAt: null }, select: { status: true, branch: true, doj: true, exitDate: true, designation: true, department: true } });
    if (!before) throw new Error("Employee not found.");
    const employeeCode = cleanEmployeeCode(data.employeeCode);
    if (employeeCode) {
      const codeOwner = await prisma.employee.findUnique({ where: { employeeCode } });
      if (codeOwner && codeOwner.id !== id) {
        if (codeOwner.deletedAt) throw new Error(`Employee ID ${employeeCode} is in Recycle Bin. Restore that employee first.`);
        throw new Error(`Employee ID ${employeeCode} is already assigned to ${codeOwner.name}.`);
      }
    }
    const exitDate = parseDate(data.exitDate);
    const branch = cleanBranch(data.branch);
    const update: any = {
      employeeCode,
      name: String(data.name || "").trim(),
      mobile: String(data.mobile || "").trim(),
      role: data.role || "EMPLOYEE",
      designation: data.designation || "",
      department: data.department || "",
      branch,
      dob: parseDate(data.dob),
      doj: parseDate(data.doj),
      exitDate,
      status: exitDate ? "INACTIVE" : (data.status || "ACTIVE")
    };
    if (data.password) update.password = await bcrypt.hash(String(data.password), 10);
    const isRejoin = data.rejoin === true;
    if (isRejoin) {
      if (before.status !== "INACTIVE" || !before.exitDate) throw new Error("Only an exited/inactive employee can be rejoined.");
      if (!update.doj) throw new Error("Rejoining date is required.");
      if (update.doj <= before.exitDate) throw new Error("Rejoining date must be after the previous exit date.");
      update.exitDate = null;
      update.status = "ACTIVE";
    }

    const employee = await prisma.$transaction(async tx => {
      if (isRejoin) {
        await (tx as any).employmentHistory.create({
          data: {
            employeeId: id,
            joiningDate: before.doj,
            exitDate: before.exitDate,
            designation: before.designation,
            department: before.department,
            branch: before.branch,
            recordedById: session.id,
            recordedByName: session.name
          }
        });
      }
      const saved = await tx.employee.update({ where: { id }, data: update });
      if ((before.branch || null) !== branch) {
        await tx.branchTransfer.create({
          data: { employeeId: id, fromBranch: before.branch || null, toBranch: branch || "UNASSIGNED", changedById: session.id, changedByName: session.name }
        });
      }
      return saved;
    });
    await addAuditLog({ actorId: session.id, actorName: session.name, action: isRejoin ? "REJOIN_EMPLOYEE" : (data.password ? "RESET_PASSWORD_OR_UPDATE_EMPLOYEE" : "UPDATE_EMPLOYEE"), target: employee.name, details: { employeeCode: employee.employeeCode, mobile: employee.mobile, designation: employee.designation, department: employee.department, branch: employee.branch, status: employee.status, rejoin: isRejoin || undefined } });
    if (isRejoin) {
      await addSystemNotification({
        actorId: session.id,
        action: "REJOIN_EMPLOYEE",
        text: `Employee rejoined: ${employee.name} on ${String(data.doj || "")} by ${session.name}.`,
        type: "INFORMATION"
      });
    }
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
    await requireHrPermission(session.role, "hrCanDeleteEmployee", "HR is not allowed to delete employees.");
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
