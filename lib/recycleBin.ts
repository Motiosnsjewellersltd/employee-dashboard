import { prisma } from "@/lib/prisma";

export const RECYCLE_RETENTION_DAYS = 30;
let lastCleanupAt = 0;

export async function cleanupRecycleBin() {
  const cutoff = new Date(Date.now() - RECYCLE_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const leaves = await prisma.leaveRecord.deleteMany({
    where: { deletedAt: { not: null, lte: cutoff } }
  });

  const employees = await prisma.employee.deleteMany({
    where: { deletedAt: { not: null, lte: cutoff } }
  });

  lastCleanupAt = Date.now();
  return { employees: employees.count, leaves: leaves.count, cutoff };
}

export async function maybeCleanupRecycleBin() {
  if (Date.now() - lastCleanupAt < 60 * 60 * 1000) return;
  await cleanupRecycleBin();
}
