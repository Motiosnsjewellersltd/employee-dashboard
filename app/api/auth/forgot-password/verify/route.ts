import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateResetToken, hashOtp, hashResetToken, passwordResetConfig } from "@/lib/passwordReset";
import { ok } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const requestId = String(body.requestId || "").trim();
    const otp = String(body.otp || "").trim();
    if (!requestId || !/^\d{6}$/.test(otp)) {
      return NextResponse.json({ ok: false, error: "Enter the 6-digit OTP." }, { status: 400 });
    }

    const record = await (prisma as any).passwordResetOtp.findUnique({ where: { id: requestId } });
    if (!record || record.usedAt) return NextResponse.json({ ok: false, error: "OTP request is no longer valid." }, { status: 400 });
    if (record.verifiedAt) return NextResponse.json({ ok: false, error: "OTP has already been verified." }, { status: 400 });
    if (new Date(record.expiresAt).getTime() < Date.now()) return NextResponse.json({ ok: false, error: "OTP has expired. Please request a new OTP." }, { status: 400 });
    if (Number(record.attempts || 0) >= passwordResetConfig.maxVerifyAttempts) {
      return NextResponse.json({ ok: false, error: "Too many incorrect OTP attempts. Please request a new OTP." }, { status: 429 });
    }

    if (record.otpHash !== hashOtp(otp)) {
      const attempts = Number(record.attempts || 0) + 1;
      await (prisma as any).passwordResetOtp.update({ where: { id: record.id }, data: { attempts } });
      const remaining = Math.max(0, passwordResetConfig.maxVerifyAttempts - attempts);
      return NextResponse.json({ ok: false, error: remaining ? `Incorrect OTP. ${remaining} attempt(s) remaining.` : "Too many incorrect OTP attempts. Please request a new OTP." }, { status: 400 });
    }

    const resetToken = generateResetToken();
    await (prisma as any).passwordResetOtp.update({
      where: { id: record.id },
      data: {
        verifiedAt: new Date(),
        resetTokenHash: hashResetToken(resetToken),
        resetTokenExpiresAt: new Date(Date.now() + passwordResetConfig.resetTtlMs)
      }
    });

    return ok({ resetToken, expiresInSeconds: Math.floor(passwordResetConfig.resetTtlMs / 1000) });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Unable to verify OTP." }, { status: 500 });
  }
}
