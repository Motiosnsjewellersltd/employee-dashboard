import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export function ok(data: unknown = {}) {
  return NextResponse.json({ ok: true, data });
}

export function fail(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : String(error || "Error");
  return NextResponse.json({ ok: false, error: message }, { status });
}

export function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === "number" && value > 20000 && value < 80000) {
    const base = Date.UTC(1899, 11, 30);
    return new Date(base + value * 86400000);
  }
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{5}$/.test(s)) return parseDate(Number(s));
  let m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = Number(m[3]);
    return new Date(y, mo - 1, d);
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function formatDate(date: Date | null | undefined) {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

export function cleanMonthYear(value: unknown): string {
  if (!value) return "";
  if (value instanceof Date && !isNaN(value.getTime())) return `${String(value.getMonth() + 1).padStart(2, "0")}/${value.getFullYear()}`;
  if (typeof value === "number" && value > 20000 && value < 80000) {
    const d = parseDate(value)!;
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  }
  const s = String(value).trim();
  if (!s) return "";
  if (/^\d{5}$/.test(s)) return cleanMonthYear(Number(s));
  let m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${String(Number(m[1])).padStart(2, "0")}/${m[2]}`;
  m = s.match(/^(\d{1,2})-(\d{4})$/);
  if (m) return `${String(Number(m[1])).padStart(2, "0")}/${m[2]}`;
  m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (m) return `${String(Number(m[2])).padStart(2, "0")}/${m[3]}`;
  return s;
}

export function excelCell(row: any, names: string[]) {
  for (const name of names) {
    const found = Object.keys(row).find(k => k.trim().toLowerCase() === name.trim().toLowerCase());
    if (found && row[found] !== undefined && row[found] !== null && String(row[found]).trim() !== "") return row[found];
  }
  return "";
}

export async function saveUpload(file: File, folder: "photos" | "chat") {
  const ext = path.extname(file.name || "") || ".bin";
  const safeBase = (file.name || "file").replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 80);
  const name = `${Date.now()}-${Math.random().toString(16).slice(2)}-${safeBase}${safeBase.endsWith(ext) ? "" : ext}`;

  // Vercel Functions have a 4.5 MB request-body limit for server uploads.
  if (process.env.VERCEL && file.size > 4 * 1024 * 1024) {
    throw new Error("Cloud upload size must be 4 MB or less.");
  }

  // On Vercel, local filesystem writes are ephemeral. Persist uploads in Vercel Blob.
  if (process.env.VERCEL) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`uploads/${folder}/${name}`, file, { access: "public" });
    return blob.url;
  }

  // Keep the existing local-PC behavior unchanged.
  const bytes = Buffer.from(await file.arrayBuffer());
  const dir = path.join(process.cwd(), "public", "uploads", folder);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), bytes);
  return `/uploads/${folder}/${name}`;
}

export function employeeSelect(e: any) {
  return {
    id: e.id,
    name: e.name,
    mobile: e.mobile,
    role: e.role,
    designation: e.designation,
    department: e.department,
    dob: formatDate(e.dob),
    doj: formatDate(e.doj),
    exitDate: formatDate(e.exitDate),
    status: e.status,
    photoUrl: e.photoUrl,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    lastSeenAt: e.lastSeenAt
  };
}

export function getFinancialYear(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return month >= 4 ? { start: year, end: year + 1, label: `${year}-${String(year + 1).slice(2)}` } : { start: year - 1, end: year, label: `${year - 1}-${String(year).slice(2)}` };
}

export function monthEarned(month: number) {
  const thirtyOne = [1, 3, 5, 7, 8, 10, 12];
  return thirtyOne.includes(month) ? 2 : 1.5;
}
