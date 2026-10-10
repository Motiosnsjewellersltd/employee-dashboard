import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const attemptId = String(body.attemptId || "").trim();
    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const accuracy = Number(body.accuracy);

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new Error("Invalid latitude.");
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error("Invalid longitude.");
    if (!Number.isFinite(accuracy) || accuracy < 0) throw new Error("Invalid location accuracy.");

    let attempt: any = null;
    if (attemptId) {
      attempt = await (prisma as any).loginAttempt.findFirst({
        where: { id: attemptId, employeeId: session.id, success: true }
      });
    }

    if (!attempt) {
      attempt = await (prisma as any).loginAttempt.findFirst({
        where: { employeeId: session.id, success: true },
        orderBy: { createdAt: "desc" }
      });
    }

    if (!attempt) throw new Error("Login record not found.");

    await (prisma as any).loginAttempt.update({
      where: { id: attempt.id },
      data: {
        latitude,
        longitude,
        locationAccuracy: accuracy,
        locationCapturedAt: new Date()
      }
    });

    return ok({ saved: true, attemptId: attempt.id });
  } catch (e) {
    return fail(e, 400);
  }
}
