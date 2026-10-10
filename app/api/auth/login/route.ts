import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createToken, publicUser, setAuthCookie, setDeviceCookie } from "@/lib/auth";
import { fail, ok } from "@/lib/utils";

async function writeLoginAttempt(data: {
  username: string;
  employeeId?: string | null;
  employeeName?: string | null;
  success: boolean;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  try {
    return await (prisma as any).loginAttempt.create({ data });
  } catch {
    // Login history must never block login itself.
    return null;
  }
}

export async function POST(req: NextRequest) {
  let username = "";
  let matchedUser: any = null;
  let deviceToken = "";
  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  const userAgent = req.headers.get("user-agent") || null;

  try {
    const body = await req.json();
    username = String(body.username || "").trim();
    const bodyDeviceToken = String(body.deviceId || "").trim();
    const cookieDeviceToken = String(req.cookies.get("motisons_device_id")?.value || "").trim();
    deviceToken = cookieDeviceToken || bodyDeviceToken;
    if (!/^[A-Za-z0-9_-]{16,160}$/.test(deviceToken)) deviceToken = crypto.randomUUID();
    const deviceLabel = String(body.deviceLabel || "").trim().slice(0, 160) || null;
    const password = String(body.password || "").trim();
    if (!username || !password) throw new Error("Username/mobile and password required.");

    matchedUser = await prisma.employee.findFirst({
      where: { deletedAt: null, OR: [{ mobile: username }, { name: username }] }
    });
    if (!matchedUser) throw new Error("Invalid login.");

    const plainOk = matchedUser.password === password;
    const hashOk = matchedUser.password.startsWith("$2") ? await bcrypt.compare(password, matchedUser.password) : false;
    if (!plainOk && !hashOk) throw new Error("Invalid login.");
    if (matchedUser.status !== "ACTIVE" || matchedUser.exitDate) throw new Error("You are an inactive employee.");

    // One device can be registered to only one employee. The binding survives logout.
    const existingDevice = await (prisma as any).deviceBinding.findUnique({ where: { deviceToken } });
    if (existingDevice?.isBlocked) {
      throw new Error("This device is blocked. Please contact Admin/HR.");
    }
    if (existingDevice && existingDevice.employeeId !== matchedUser.id) {
      throw new Error(`This device is already registered to ${existingDevice.employeeName}. Please contact Admin/HR to reassign it.`);
    }

    if (existingDevice) {
      await (prisma as any).deviceBinding.update({
        where: { id: existingDevice.id },
        data: {
          employeeName: matchedUser.name,
          deviceLabel,
          userAgent,
          lastIpAddress: ipAddress,
          lastSeenAt: new Date()
        }
      });
    } else {
      await (prisma as any).deviceBinding.create({
        data: {
          deviceToken,
          employeeId: matchedUser.id,
          employeeName: matchedUser.name,
          deviceLabel,
          userAgent,
          firstIpAddress: ipAddress,
          lastIpAddress: ipAddress
        }
      });
    }

    if (plainOk && !hashOk) {
      await prisma.employee.update({ where: { id: matchedUser.id }, data: { password: await bcrypt.hash(password, 10) } });
    }

    matchedUser = await prisma.employee.update({
      where: { id: matchedUser.id },
      data: {
        lastSeenAt: new Date(),
        ...(password === "1234" ? { mustChangePassword: true } : {})
      }
    });
    const sessionUser = publicUser(matchedUser);
    await setAuthCookie(await createToken(sessionUser));
    await setDeviceCookie(deviceToken);
    const loginAttempt = await writeLoginAttempt({
      username,
      employeeId: matchedUser.id,
      employeeName: matchedUser.name,
      success: true,
      ipAddress,
      userAgent
    });
    return ok({ user: sessionUser, loginAttemptId: loginAttempt?.id || null, deviceId: deviceToken });
  } catch (e: any) {
    await writeLoginAttempt({
      username: username || "(blank)",
      employeeId: matchedUser?.id || null,
      employeeName: matchedUser?.name || null,
      success: false,
      reason: e?.message || "Login failed.",
      ipAddress,
      userAgent
    });
    return fail(e, 401);
  }
}
