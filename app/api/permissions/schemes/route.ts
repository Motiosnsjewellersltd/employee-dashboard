import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { addAuditLog } from "@/lib/audit";
import { keyForEmployee } from "@/lib/schemeAccess";
import { fail, ok } from "@/lib/utils";

const PREFIX = "employeeSchemeVisible:";

export async function GET() {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN") throw new Error("Only Admin allowed.");
    const [employees, settings] = await Promise.all([
      prisma.employee.findMany({
        where: { role: "EMPLOYEE", deletedAt: null },
        select: { id: true, name: true, employeeCode: true, designation: true, branch: true, status: true },
        orderBy: { name: "asc" }
      }),
      prisma.permissionSetting.findMany({
        where: { key: { startsWith: PREFIX } },
        select: { key: true, value: true }
      })
    ]);
    const allowed = new Set(settings.filter(x => x.value === "true").map(x => x.key));
    return ok({ employees: employees.map(e => ({ ...e, visible: allowed.has(keyForEmployee(e.id)) })) });
  } catch (e) {
    return fail(e, 403);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN") throw new Error("Only Admin allowed.");
    const body = await req.json();
    const employeeId = String(body?.employeeId || "").trim();
    if (!employeeId || typeof body?.visible !== "boolean") {
      throw new Error("Invalid employee or visibility value.");
    }
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, role: "EMPLOYEE", deletedAt: null },
      select: { id: true, name: true }
    });
    if (!employee) throw new Error("Employee not found.");

    // Revoking deletes the grant; absence is interpreted as Hidden.
    const key = keyForEmployee(employee.id);
    if (body.visible) {
      await prisma.permissionSetting.upsert({
        where: { key },
        create: { key, value: "true" },
        update: { value: "true" }
      });
    } else {
      await prisma.permissionSetting.deleteMany({ where: { key } });
    }
    await addAuditLog({
      actorId: session.id,
      actorName: session.name,
      action: "UPDATE_SCHEME_VISIBILITY",
      target: employee.name,
      details: { employeeId, visible: body.visible }
    });
    return ok({ employeeId, visible: body.visible });
  } catch (e) {
    return fail(e, 403);
  }
}
