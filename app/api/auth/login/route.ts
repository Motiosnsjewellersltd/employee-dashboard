import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createToken, publicUser, setAuthCookie } from "@/lib/auth";
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
    await (prisma as any).loginAttempt.create({ data });
  } catch {
    // Login history must never block login itself.
  }
}

export async function POST(req: NextRequest) {
  let username = "";
  let matchedUser: any = null;
  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  const userAgent = req.headers.get("user-agent") || null;

  try {
    const body = await req.json();
    username = String(body.username || "").trim();
    const password = String(body.password || "").trim();
    if (!username || !password) throw new Error("Username/mobile and password required.");

    matchedUser = await prisma.employee.findFirst({
      where: { deletedAt: null, OR: [{ mobile: username }, { name: username }] }
    });
    if (!matchedUser) throw new Error("Invalid login.");
    if (matchedUser.status !== "ACTIVE") throw new Error("This user is inactive.");

    const plainOk = matchedUser.password === password;
    const hashOk = matchedUser.password.startsWith("$2") ? await bcrypt.compare(password, matchedUser.password) : false;
    if (!plainOk && !hashOk) throw new Error("Invalid login.");

    if (plainOk && !hashOk) {
      await prisma.employee.update({ where: { id: matchedUser.id }, data: { password: await bcrypt.hash(password, 10) } });
    }

    await prisma.employee.update({ where: { id: matchedUser.id }, data: { lastSeenAt: new Date() } });
    const sessionUser = publicUser(matchedUser);
    await setAuthCookie(await createToken(sessionUser));
    await writeLoginAttempt({
      username,
      employeeId: matchedUser.id,
      employeeName: matchedUser.name,
      success: true,
      ipAddress,
      userAgent
    });
    return ok({ user: sessionUser });
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
