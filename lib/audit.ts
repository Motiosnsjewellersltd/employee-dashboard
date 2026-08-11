import { prisma } from "@/lib/prisma";

export async function addAuditLog(input: {
  actorId?: string | null;
  actorName?: string | null;
  action: string;
  target?: string | null;
  details?: unknown;
}) {
  try {
    await (prisma as any).activityLog.create({
      data: {
        actorId: input.actorId || null,
        actorName: input.actorName || null,
        action: input.action,
        target: input.target || null,
        details:
          input.details === undefined
            ? null
            : typeof input.details === "string"
              ? input.details
              : JSON.stringify(input.details)
      }
    });
  } catch {
    // Audit log should never stop the main action.
  }
}
