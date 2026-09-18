import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { employeeSelect, fail, ok, parseDate } from "@/lib/utils";
import { addAuditLog } from "@/lib/audit";
import { addSystemNotification } from "@/lib/systemNotification";
import { requireHrPermission } from "@/lib/permissions";

function roleGuard(role: string) {
  if (!["ADMIN", "HR"].includes(role)) throw new Error("Only Admin/HR allowed.");
}

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

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const url = new URL(req.url);
    const q = String(url.searchParams.get("q") || "").trim();
    const designation = String(url.searchParams.get("designation") || "").trim();
    const status = String(url.searchParams.get("status") || "").trim();
    const where: any = { deletedAt: null };

    if (session.role === "EMPLOYEE") where.id = session.id;
    if (q) where.OR = [{ employeeCode: { contains: q } }, { name: { contains: q } }, { mobile: { contains: q } }];
    if (designation && designation !== "All") where.designation = designation;
    if (status && status !== "All") where.status = status;

    const users = await prisma.employee.findMany({ where, orderBy: { name: "asc" } });
    return ok({ employees: users.map(employeeSelect) });
  } catch (e) {
    return fail(e, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    roleGuard(session.role);
    await requireHrPermission(session.role, "hrCanAddEmployee", "HR is not allowed to add employees.");
    const data = await req.json();
    if (!data.name || !data.mobile) throw new Error("Name and mobile required.");
    const employeeCode = cleanEmployeeCode(data.employeeCode);
    const password = data.password ? await bcrypt.hash(String(data.password), 10) : await bcrypt.hash("1234", 10);
    const existing = await prisma.employee.findUnique({ where: { mobile: String(data.mobile).trim() } });
    if (existing?.deletedAt) throw new Error("An employee with this mobile is in Recycle Bin. Restore that employee first.");
    if (employeeCode) {
      const codeOwner = await prisma.employee.findUnique({ where: { employeeCode } });
      if (codeOwner && codeOwner.id !== existing?.id) {
        if (codeOwner.deletedAt) throw new Error(`Employee ID ${employeeCode} is in Recycle Bin. Restore that employee first.`);
        throw new Error(`Employee ID ${employeeCode} is already assigned to ${codeOwner.name}.`);
      }
    }
    const exitDate = parseDate(data.exitDate);
    const branch = cleanBranch(data.branch);
    const status = exitDate ? "INACTIVE" : (data.status || "ACTIVE");
    const employeeData = {
        employeeCode,
        name: String(data.name).trim(),
        role: data.role || "EMPLOYEE",
        designation: data.designation || "",
        department: data.department || "",
        branch,
        dob: parseDate(data.dob),
        doj: parseDate(data.doj),
        exitDate,
        status,
        password
      } as const;
    const employee = await prisma.$transaction(async tx => {
      const saved = existing
        ? await tx.employee.update({ where: { id: existing.id }, data: employeeData })
        : await tx.employee.create({ data: { ...employeeData, mobile: String(data.mobile).trim() } });
      if (existing && (existing.branch || null) !== branch) {
        await tx.branchTransfer.create({
          data: { employeeId: saved.id, fromBranch: existing.branch || null, toBranch: branch || "UNASSIGNED", changedById: session.id, changedByName: session.name }
        });
      }
      return saved;
    });
    await addAuditLog({ actorId: session.id, actorName: session.name, action: existing ? "UPDATE_EMPLOYEE" : "ADD_EMPLOYEE", target: employee.name, details: { employeeCode: employee.employeeCode, mobile: employee.mobile, designation: employee.designation, department: employee.department, branch: employee.branch, status: employee.status } });
    if (!existing) {
      await addSystemNotification({
        actorId: session.id,
        action: "ADD_EMPLOYEE",
        text: `Employee added: ${employee.name} (${employee.mobile}) by ${session.name}.`
      });
    }
    return ok({ employee: employeeSelect(employee) });
  } catch (e) {
    return fail(e);
  }
}
