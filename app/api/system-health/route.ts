import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { fail, ok } from "@/lib/utils";
import { cleanupRecycleBin, RECYCLE_RETENTION_DAYS } from "@/lib/recycleBin";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !["ADMIN", "HR"].includes(session.role)) throw new Error("Only Admin/HR allowed.");

    let database = "CONNECTED";
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = "DISCONNECTED";
    }

    const cleanup = database === "CONNECTED" ? await cleanupRecycleBin() : { employees: 0, leaves: 0 };
    const [deletedEmployees, deletedLeaves] = database === "CONNECTED"
      ? await Promise.all([
          prisma.employee.count({ where: { deletedAt: { not: null } } }),
          prisma.leaveRecord.count({ where: { deletedAt: { not: null } } })
        ])
      : [0, 0];

    return ok({
      server: "RUNNING",
      database,
      recycleBin: { retentionDays: RECYCLE_RETENTION_DAYS, deletedEmployees, deletedLeaves, autoCleaned: cleanup },
      checkedAt: new Date().toISOString()
    });
  } catch (e) {
    return fail(e, 401);
  }
}
