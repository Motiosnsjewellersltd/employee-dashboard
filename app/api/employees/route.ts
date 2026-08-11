import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { employeeSelect, fail, ok, parseDate } from "@/lib/utils";
import { addAuditLog } from "@/lib/audit";
import { addSystemNotification } from "@/lib/systemNotification";

function roleGuard(role: string) {
  if (!["ADMIN", "HR"].includes(role)) throw new Error("Only Admin/HR allowed.");
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
    if (q) where.OR = [{ name: { contains: q } }, { mobile: { contains: q } }];
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
    const data = await req.json();
    if (!data.name || !data.mobile) throw new Error("Name and mobile required.");
    const password = data.password ? await bcrypt.hash(String(data.password), 10) : await bcrypt.hash("1234", 10);
    const existing = await prisma.employee.findUnique({ where: { mobile: String(data.mobile).trim() } });
    if (existing?.deletedAt) throw new Error("An employee with this mobile is in Recycle Bin. Restore that employee first.");
    const employee = await prisma.employee.upsert({
      where: { mobile: String(data.mobile).trim() },
      update: {
        name: String(data.name).trim(),
        role: data.role || "EMPLOYEE",
        designation: data.designation || "",
        department: data.department || "",
        dob: parseDate(data.dob),
        doj: parseDate(data.doj),
        exitDate: parseDate(data.exitDate),
        status: data.status || "ACTIVE",
        password
      },
      create: {
        name: String(data.name).trim(),
        mobile: String(data.mobile).trim(),
        password,
        role: data.role || "EMPLOYEE",
        designation: data.designation || "",
        department: data.department || "",
        dob: parseDate(data.dob),
        doj: parseDate(data.doj),
        exitDate: parseDate(data.exitDate),
        status: data.status || "ACTIVE"
      }
    });
    await addAuditLog({ actorId: session.id, actorName: session.name, action: existing ? "UPDATE_EMPLOYEE" : "ADD_EMPLOYEE", target: employee.name, details: { mobile: employee.mobile, designation: employee.designation, department: employee.department } });
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
