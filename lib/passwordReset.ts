import { createHash, randomBytes, randomInt } from "crypto";
import { prisma } from "@/lib/prisma";

const OTP_TTL_MS = 10 * 60 * 1000;
const RESET_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

function secret() {
  const value = process.env.PASSWORD_RESET_SECRET || process.env.JWT_SECRET;
  if (!value) throw new Error("PASSWORD_RESET_SECRET or JWT_SECRET is not configured.");
  return value;
}

export function cleanMobile(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

export function mobileCandidates(value: unknown) {
  const digits = cleanMobile(value);
  if (!digits) return [];
  const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
  return Array.from(new Set([
    digits,
    last10,
    last10.length === 10 ? `91${last10}` : "",
    last10.length === 10 ? `+91${last10}` : ""
  ].filter(Boolean)));
}

export async function findEmployeeByRegisteredMobile(value: unknown): Promise<any> {
  const candidates = mobileCandidates(value);
  if (!candidates.length) return null;
  return prisma.employee.findFirst({
    where: {
      deletedAt: null,
      mobile: { in: candidates }
    }
  });
}

export function toWhatsAppNumber(value: unknown) {
  const digits = cleanMobile(value);
  if (!digits) return "";
  const last10 = digits.slice(-10);
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  if (last10.length === 10) return `91${last10}`;
  return digits;
}

export function hashOtp(otp: string) {
  return createHash("sha256").update(`${otp}:${secret()}`).digest("hex");
}

export function hashResetToken(token: string) {
  return createHash("sha256").update(`${token}:${secret()}`).digest("hex");
}

export function generateOtp() {
  return String(randomInt(100000, 1000000));
}

export function generateResetToken() {
  return randomBytes(32).toString("hex");
}

export const passwordResetConfig = {
  otpTtlMs: OTP_TTL_MS,
  resetTtlMs: RESET_TTL_MS,
  resendCooldownMs: RESEND_COOLDOWN_MS,
  maxVerifyAttempts: MAX_VERIFY_ATTEMPTS
};

export async function sendPasswordResetOtpWhatsApp(mobile: string, otp: string) {
  const base = String(process.env.WATI_API_BASE_URL || "").replace(/\/$/, "");
  const token = String(process.env.WATI_API_TOKEN || "").replace(/^Bearer\s+/i, "").trim();
  const templateName = String(process.env.WATI_PASSWORD_RESET_TEMPLATE || "employee_dashboard_password_reset_otp").trim();
  if (!base) throw new Error("WATI_API_BASE_URL is not configured.");
  if (!token) throw new Error("WATI_API_TOKEN is not configured.");
  if (!templateName) throw new Error("WATI_PASSWORD_RESET_TEMPLATE is not configured.");

  const whatsappNumber = toWhatsAppNumber(mobile);
  if (!whatsappNumber) throw new Error("Registered WhatsApp mobile number is invalid.");

  const url = `${base}/api/v1/sendTemplateMessage?whatsappNumber=${encodeURIComponent(whatsappNumber)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      template_name: templateName,
      broadcast_name: "employee_dashboard_password_reset_otp",
      parameters: [{ name: "1", value: otp }]
    }),
    cache: "no-store"
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`WhatsApp OTP could not be sent (WATI ${response.status}).${responseText ? ` ${responseText.slice(0, 300)}` : ""}`);
  }

  if (responseText) {
    try {
      const parsed = JSON.parse(responseText);
      if (parsed && parsed.result === false) {
        throw new Error(parsed.info || parsed.error || "WATI rejected the OTP message.");
      }
    } catch (error: any) {
      if (error instanceof SyntaxError) {
        // Some WATI endpoints may return plain text on success.
      } else {
        throw error;
      }
    }
  }
}
