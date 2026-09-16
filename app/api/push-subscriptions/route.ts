import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/utils";
import { getVapidPublicKey, isWebPushConfigured } from "@/lib/webPush";

export async function GET() {
  try {
    await requireSession();
    return ok({ enabled: isWebPushConfigured(), publicKey: getVapidPublicKey() });
  } catch (error) {
    return fail(error, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!isWebPushConfigured()) throw new Error("Push notifications are not configured on the server.");
    const body = await req.json();
    const endpoint = String(body.endpoint || "").trim();
    const p256dh = String(body.keys?.p256dh || "").trim();
    const auth = String(body.keys?.auth || "").trim();
    if (!endpoint.startsWith("https://") || !p256dh || !auth) throw new Error("Invalid push subscription.");

    await prisma.pushSubscription.upsert({
      where: { endpoint },
      update: {
        employeeId: session.id,
        p256dh,
        auth,
        userAgent: req.headers.get("user-agent") || null,
      },
      create: {
        employeeId: session.id,
        endpoint,
        p256dh,
        auth,
        userAgent: req.headers.get("user-agent") || null,
      },
    });
    return ok({ subscribed: true });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json().catch(() => ({}));
    const endpoint = String(body.endpoint || "").trim();
    if (endpoint) {
      await prisma.pushSubscription.deleteMany({ where: { employeeId: session.id, endpoint } });
    } else {
      await prisma.pushSubscription.deleteMany({ where: { employeeId: session.id } });
    }
    return ok();
  } catch (error) {
    return fail(error);
  }
}
