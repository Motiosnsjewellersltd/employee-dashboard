import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { prisma } from "./prisma";
import { maybeCleanupRecycleBin } from "./recycleBin";

const COOKIE_NAME = "employee_dashboard_token";

function jwtSecret() {
  const configured = process.env.JWT_SECRET;
  if (configured) return new TextEncoder().encode(configured);
  if (process.env.NODE_ENV !== "production") {
    return new TextEncoder().encode("motisons_employee_dashboard_local_dev_only");
  }
  throw new Error("JWT_SECRET is not configured.");
}

export type SessionUser = {
  id: string;
  name: string;
  mobile: string;
  role: "ADMIN" | "HR" | "EMPLOYEE";
  designation?: string | null;
  department?: string | null;
  photoUrl?: string | null;
};

export async function createToken(user: SessionUser) {
  return new SignJWT(user as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(jwtSecret());
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const verified = await jwtVerify(token, jwtSecret());
    return verified.payload as SessionUser;
  } catch {
    return null;
  }
}

export async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  const active = await prisma.employee.findFirst({ where: { id: session.id, deletedAt: null }, select: { id: true } });
  if (!active) throw new Error("Unauthorized");
  await prisma.employee.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => null);
  await maybeCleanupRecycleBin().catch(() => null);
  return session;
}

export async function setAuthCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production"
  });
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
}

export function publicUser(user: any): SessionUser {
  return {
    id: user.id,
    name: user.name,
    mobile: user.mobile,
    role: user.role,
    designation: user.designation,
    department: user.department,
    photoUrl: user.photoUrl
  };
}
