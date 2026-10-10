import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { prisma } from "./prisma";
import { maybeCleanupRecycleBin } from "./recycleBin";

const COOKIE_NAME = "employee_dashboard_token";
const DEVICE_COOKIE_NAME = "motisons_device_id";

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
  employeeCode?: string | null;
  name: string;
  mobile: string;
  role: "ADMIN" | "HR" | "EMPLOYEE";
  designation?: string | null;
  department?: string | null;
  branch?: string | null;
floor?: string | null;
managerScope?: string | null;
isFloorManager?: boolean;
  photoUrl?: string | null;
  mustChangePassword?: boolean;
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
    const tokenUser = verified.payload as SessionUser;

    if (!tokenUser?.id) return null;

    // Always refresh security-sensitive session flags from the database.
    // This keeps password-change status consistent across mobile, laptop and PC
    // even when another device still has an older 7-day JWT cookie.
    const currentUser = await prisma.employee.findFirst({
      where: {
        id: tokenUser.id,
        deletedAt: null,
        status: "ACTIVE",
        exitDate: null
      }
    });

    if (!currentUser) return null;

    // If this session was created after device registration was introduced,
    // enforce the server-side device binding on every authenticated request.
    const deviceToken = cookieStore.get(DEVICE_COOKIE_NAME)?.value;
    if (deviceToken) {
      const device = await (prisma as any).deviceBinding.findUnique({ where: { deviceToken } }).catch(() => null);
      if (!device || device.isBlocked || device.employeeId !== currentUser.id) return null;
      await (prisma as any).deviceBinding.update({
        where: { id: device.id },
        data: { lastSeenAt: new Date() }
      }).catch(() => null);
    }

    return publicUser(currentUser);
  } catch {
    return null;
  }
}

export async function requireSession(options?: { allowPasswordChange?: boolean }) {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  if (session.mustChangePassword && !options?.allowPasswordChange) throw new Error("Password change required.");
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


export async function setDeviceCookie(deviceToken: string) {
  const cookieStore = await cookies();
  cookieStore.set(DEVICE_COOKIE_NAME, deviceToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365 * 5,
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
    employeeCode: user.employeeCode,
    name: user.name,
    mobile: user.mobile,
    role: user.role,
    designation: user.designation,
    department: user.department,
    branch: user.branch,
floor: user.floor,
isFloorManager: Boolean(user.isFloorManager),
managerScope: user.managerScope,
    photoUrl: user.photoUrl,
    mustChangePassword: Boolean(user.mustChangePassword)
  };
}
