import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { hashResetToken } from "@/lib/passwordReset";
import { ok } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const requestId = String(body.requestId || "").trim();
    const resetToken = String(body.resetToken || "").trim();
    const password = String(body.password || "");
    const confirmPassword = String(body.confirmPassword || "");

    if (!requestId || !resetToken) return NextResponse.json({ ok: false, error: "Password reset session is invalid." }, { status: 400 });
    if (password.length !== 6) return NextResponse.json({ ok: false, error: "Password must be exactly 6 characters." }, { status: 400 });
    if (password !== confirmPassword) return NextResponse.json({ ok: false, error: "New password and confirm password do not match." }, { status: 400 });

    const record = await (prisma as any).passwordResetOtp.findUnique({ where: { id: requestId } });
    if (!record || record.usedAt || !record.verifiedAt || !record.resetTokenHash || !record.resetTokenExpiresAt) {
      return NextResponse.json({ ok: false, error: "Password reset session is no longer valid." }, { status: 400 });
    }
    if (new Date(record.resetTokenExpiresAt).getTime() < Date.now()) {
      return NextResponse.json({ ok: false, error: "Password reset session has expired. Please request a new OTP." }, { status: 400 });
    }
    if (record.resetTokenHash !== hashResetToken(resetToken)) {
      return NextResponse.json({ ok: false, error: "Password reset session is invalid." }, { status: 400 });
    }

    const employee = await prisma.employee.findFirst({ where: { id: record.employeeId, deletedAt: null } });
    if (!employee || employee.status !== "ACTIVE" || employee.exitDate) {
      return NextResponse.json({ ok: false, error: "Employee account is not active." }, { status: 400 });
    }
    if ((employee as any).mustChangePassword) {
      return NextResponse.json({ ok: false, error: "Please complete first login password setup instead." }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.$transaction([
      (prisma as any).employee.update({
        where: { id: employee.id },
        data: { password: passwordHash, mustChangePassword: false }
      }),
      (prisma as any).passwordResetOtp.update({
        where: { id: record.id },
        data: { usedAt: new Date() }
      })
    ]);

    return ok({ reset: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Unable to reset password." }, { status: 500 });
  }
}
