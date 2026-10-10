import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/utils";
import { requireHrPermission } from "@/lib/permissions";

async function requireDeviceAdmin() {
  const session = await requireSession();
  if (!["ADMIN", "HR"].includes(session.role)) throw new Error("Only Admin/HR allowed.");
  await requireHrPermission(session.role, "hrCanViewLoginHistory", "HR is not allowed to manage registered devices.");
  return session;
}

export async function GET() {
  try {
    await requireDeviceAdmin();
    const devices = await (prisma as any).deviceBinding.findMany({
      orderBy: { lastSeenAt: "desc" },
      take: 1000
    });
    return ok({ devices });
  } catch (e) {
    return fail(e, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireDeviceAdmin();
    const body = await req.json();
    const id = String(body.id || "").trim();
    const action = String(body.action || "").trim().toLowerCase();
    if (!id) throw new Error("Device ID required.");

    const device = await (prisma as any).deviceBinding.findUnique({ where: { id } });
    if (!device) throw new Error("Registered device not found.");

    if (action === "unbind") {
      await (prisma as any).deviceBinding.delete({ where: { id } });
      await (prisma as any).activityLog.create({
        data: {
          actorId: session.id,
          actorName: session.name,
          action: "UNBIND_DEVICE",
          target: device.employeeName,
          details: `Device binding removed: ${device.deviceLabel || "Unknown device"}`
        }
      }).catch(() => null);
      return ok({ message: "Device unbound. Another employee can now register on it." });
    }

    if (action === "block" || action === "unblock") {
      const blocking = action === "block";
      await (prisma as any).deviceBinding.update({
        where: { id },
        data: {
          isBlocked: blocking,
          blockedAt: blocking ? new Date() : null,
          blockedById: blocking ? session.id : null,
          blockedByName: blocking ? session.name : null
        }
      });
      await (prisma as any).activityLog.create({
        data: {
          actorId: session.id,
          actorName: session.name,
          action: blocking ? "BLOCK_DEVICE" : "UNBLOCK_DEVICE",
          target: device.employeeName,
          details: device.deviceLabel || "Unknown device"
        }
      }).catch(() => null);
      return ok({ message: blocking ? "Device blocked." : "Device unblocked." });
    }

    throw new Error("Invalid device action.");
  } catch (e) {
    return fail(e, 400);
  }
}
