import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/utils";
import { addAuditLog } from "@/lib/audit";
import { getPermissionValues, permissionDefaults } from "@/lib/permissions";

export async function GET() {
  try {
    const session = await requireSession();
    if (!["ADMIN", "HR"].includes(session.role)) throw new Error("Only Admin/HR allowed.");
    const values = await getPermissionValues();
    return ok({ permissions: values });
  } catch (e) {
    return fail(e, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN") throw new Error("Only Admin allowed.");

    const data = await req.json();

    for (const [key, value] of Object.entries(data || {})) {
      if (!(key in permissionDefaults)) continue;
      await (prisma as any).permissionSetting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) }
      });
    }

    await addAuditLog({
      actorId: session.id,
      actorName: session.name,
      action: "UPDATE_PERMISSIONS",
      target: "Role Permissions",
      details: data
    });

    return ok();
  } catch (e) {
    return fail(e);
  }
}
