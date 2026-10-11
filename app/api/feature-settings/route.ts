import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/utils";
import { addAuditLog } from "@/lib/audit";

const FEATURE_KEYS = {
  profileLeavesVisible: "employeeProfileLeavesVisible",
  employeeChatVisible: "employeeChatVisible"
} as const;

async function readSettings() {
  const keys = Object.values(FEATURE_KEYS);
  const rows = await prisma.permissionSetting.findMany({
    where: { key: { in: keys } }
  });
  const values = new Map(rows.map(row => [row.key, String(row.value)]));
  return {
    profileLeavesVisible: values.get(FEATURE_KEYS.profileLeavesVisible) === "true",
    employeeChatVisible: values.get(FEATURE_KEYS.employeeChatVisible) === "true"
  };
}

export async function GET() {
  try {
    await requireSession();
    return ok({ settings: await readSettings() });
  } catch (e) {
    return fail(e, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN") throw new Error("Only Admin allowed.");

    const data = await req.json();
    for (const [clientKey, dbKey] of Object.entries(FEATURE_KEYS)) {
      if (!(clientKey in (data || {}))) continue;
      const value = Boolean(data[clientKey]);
      await prisma.permissionSetting.upsert({
        where: { key: dbKey },
        update: { value: String(value) },
        create: { key: dbKey, value: String(value) }
      });
    }

    const settings = await readSettings();
    await addAuditLog({
      actorId: session.id,
      actorName: session.name,
      action: "UPDATE_EMPLOYEE_FEATURE_VISIBILITY",
      target: "Employee Feature Visibility",
      details: settings
    });

    return ok({ settings });
  } catch (e) {
    return fail(e);
  }
}
