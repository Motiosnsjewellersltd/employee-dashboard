import { NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createToken, publicUser, requireSession, setAuthCookie } from "@/lib/auth";
import { addAuditLog } from "@/lib/audit";
import { fail, ok } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession({ allowPasswordChange: true });
    const body = await req.json();
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    const confirmPassword = String(body.confirmPassword || "");

    if (!currentPassword) throw new Error("Current password is required.");
    if (newPassword.length !== 6) throw new Error("New password must be exactly 6 characters.");
    if (newPassword === "1234") throw new Error("1234 cannot be used as your permanent password.");
    if (newPassword !== confirmPassword) throw new Error("New password and confirm password do not match.");
    if (currentPassword === newPassword) throw new Error("New password must be different from your current password.");

    const employee = await prisma.employee.findFirst({
      where: { id: session.id, deletedAt: null, status: "ACTIVE", exitDate: null }
    });
    if (!employee) throw new Error("Employee not found.");

    const currentOk = employee.password.startsWith("$2")
      ? await bcrypt.compare(currentPassword, employee.password)
      : employee.password === currentPassword;
    if (!currentOk) throw new Error("Current password is incorrect.");

    const updated = await prisma.employee.update({
      where: { id: employee.id },
      data: {
        password: await bcrypt.hash(newPassword, 10),
        mustChangePassword: false
      }
    });

    await addAuditLog({
      actorId: updated.id,
      actorName: updated.name,
      action: "CHANGE_OWN_PASSWORD",
      target: updated.name,
      details: { selfService: true }
    });

    const user = publicUser(updated);
    await setAuthCookie(await createToken(user));
    return ok({ user });
  } catch (error) {
    return fail(error, 400);
  }
}
