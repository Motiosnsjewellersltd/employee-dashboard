import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parsePunchBatch, punchCode, punchId, validPunchSecret } from "@/lib/biometricPunch";

export const runtime = "nodejs";
const MAX_BYTES = 1024 * 1024;
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function readPayload(req: NextRequest) {
  if (Number(req.headers.get("content-length")) > MAX_BYTES) throw new Error("Payload too large.");
  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BYTES) { await reader.cancel(); throw new Error("Payload too large."); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  const text = Buffer.concat(chunks).toString("utf8");
  const contentType = req.headers.get("content-type") || "";
  if (text.trim()) {
    if (contentType.includes("application/json")) return JSON.parse(text);
    if (contentType.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(text));
    throw new Error("Use JSON or URL-encoded form data.");
  }
  // Vendor query-string format is supported on POST, never GET.
  return Object.fromEntries(req.nextUrl.searchParams);
}

export async function POST(req: NextRequest) {
  const configured = process.env.BIOMETRIC_INGEST_SECRET || "";
  if (configured.length < 32) return reply({ ok: false, error: "Biometric integration is not configured." }, 503);
  const bearer = req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  const supplied = req.headers.get("x-biometric-key") || bearer || "";
  if (!supplied || !validPunchSecret(supplied, configured)) return reply({ ok: false, error: "Unauthorized" }, 401);

  let punches;
  try { punches = parsePunchBatch(await readPayload(req)); }
  catch (e) { return reply({ ok: false, error: e instanceof Error ? e.message : "Invalid payload." }, 400); }

  try {
    const employees = await prisma.employee.findMany({ where: { deletedAt: null, role: { not: "ADMIN" } }, select: { id: true, employeeCode: true } });
    const codes = new Map<string, string[]>();
    for (const employee of employees) {
      const code = punchCode(employee.employeeCode);
      if (code) codes.set(code, [...(codes.get(code) || []), employee.id]);
    }
    const skipped: Array<{ record: number; employeeCode: string; reason: string }> = [];
    const data = [];
    for (const [index, punch] of punches.entries()) {
      const matches = codes.get(punch.employeeCode) || [];
      if (matches.length !== 1) {
        skipped.push({ record: index + 1, employeeCode: punch.employeeCode, reason: matches.length ? "Ambiguous employee code" : "Employee code not found" });
        continue;
      }
      data.push({ id: punchId(matches[0], punch), employeeId: matches[0], punchedAt: punch.punchedAt, direction: punch.direction, deviceId: punch.deviceId });
    }
    // Unique event hashes and skipDuplicates make simultaneous retries safe.
    const saved = data.length ? await prisma.biometricPunch.createMany({ data, skipDuplicates: true }) : { count: 0 };
    return reply({ ok: true, data: { received: punches.length, saved: saved.count, duplicates: data.length - saved.count, skipped, unknownDirection: data.filter(p => p.direction === "UNKNOWN").length } });
  } catch (e) {
    const missingTable = e && typeof e === "object" && "code" in e && e.code === "P2021";
    return reply({ ok: false, error: missingTable ? "Punch storage is not installed. Apply biometric-punches.sql." : "Could not save punches. Retry this batch." }, 503);
  }
}
