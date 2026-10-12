import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  findEmployeeByRegisteredMobile,
  generateOtp,
  hashOtp,
  passwordResetConfig,
  sendPasswordResetOtpWhatsApp
} from "@/lib/passwordReset";
import { ok } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const mobile = String(body.mobile || "").trim();
    const employee = await findEmployeeByRegisteredMobile(mobile);

    if (!employee || employee.status !== "ACTIVE" || employee.exitDate) {
      return NextResponse.json({ ok: false, error: "Registered mobile number not found." }, { status: 404 });
    }
    if (employee.mustChangePassword) {
      return NextResponse.json({
        ok: false,
        error: "Please login with temporary password 1234 and set your password first."
      }, { status: 400 });
    }

    const latest = await (prisma as any).passwordResetOtp.findFirst({
      where: { employeeId: employee.id, usedAt: null },
      orderBy: { createdAt: "desc" }
    });
    if (latest && Date.now() - new Date(latest.createdAt).getTime() < passwordResetConfig.resendCooldownMs) {
      const wait = Math.ceil((passwordResetConfig.resendCooldownMs - (Date.now() - new Date(latest.createdAt).getTime())) / 1000);
      return NextResponse.json({ ok: false, error: `Please wait ${wait} seconds before requesting another OTP.` }, { status: 429 });
    }

    await (prisma as any).passwordResetOtp.updateMany({
      where: { employeeId: employee.id, usedAt: null },
      data: { usedAt: new Date() }
    });

    const otp = generateOtp();
    const record = await (prisma as any).passwordResetOtp.create({
      data: {
        employeeId: employee.id,
        mobile: employee.mobile,
        otpHash: hashOtp(otp),
        expiresAt: new Date(Date.now() + passwordResetConfig.otpTtlMs)
      }
    });

    try {
      await sendPasswordResetOtpWhatsApp(employee.mobile, otp);
    } catch (error) {
      await (prisma as any).passwordResetOtp.update({ where: { id: record.id }, data: { usedAt: new Date() } }).catch(() => null);
      throw error;
    }

    return ok({
      requestId: record.id,
      expiresInSeconds: Math.floor(passwordResetConfig.otpTtlMs / 1000),
      resendAfterSeconds: Math.floor(passwordResetConfig.resendCooldownMs / 1000)
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error?.message || "Unable to send OTP." }, { status: 500 });
  }
}
