import { createHash, timingSafeEqual } from "node:crypto";

export type PunchDirection = "IN" | "OUT" | "UNKNOWN";
export type IncomingPunch = { employeeCode: string; punchedAt: Date; direction: PunchDirection; deviceId: string };

// Numeric card numbers may be zero-padded by the device. Ambiguous employee
// matches must be rejected by the caller, even when one code matches exactly.
export function punchCode(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const code = String(value).trim().toUpperCase();
  if (!code || code.length > 64 || /[\x00-\x1f]/.test(code)) return "";
  return /^\d+$/.test(code) ? code.replace(/^0+(?=\d)/, "") : code;
}

export function validPunchSecret(supplied: string, configured: string) {
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(configured).digest();
  return timingSafeEqual(a, b);
}

// Offset-free vendor timestamps are interpreted as India local time, never the
// web server's timezone. Reject overflow dates rather than silently correcting.
export function parsePunchTime(value: unknown): Date {
  if (typeof value !== "string") throw new Error("PunchDateAndTime must be a timestamp string.");
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})?$/);
  if (!match) throw new Error("Use yyyy-MM-dd HH:mm:ss (India time), or ISO timestamp with offset.");
  const [, y, mo, d, h, mi, s, ms = "", zone = "+05:30"] = match;
  const year = Number(y), month = Number(mo), day = Number(d);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) {
    throw new Error("Invalid punch date/time.");
  }
  if (zone !== "Z" && (Number(zone.slice(1, 3)) > 14 || Number(zone.slice(4)) > 59 || (Number(zone.slice(1, 3)) === 14 && Number(zone.slice(4)) !== 0))) throw new Error("Invalid timestamp offset.");
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${ms}${zone}`);
  if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() + 5 * 60 * 1000) throw new Error("Invalid or future punch timestamp.");
  return date;
}

function field(row: Record<string, unknown>, names: string[]) {
  for (const name of names) if (row[name] !== undefined && row[name] !== null && row[name] !== "") return row[name];
  return "";
}

export function parsePunchBatch(payload: unknown): IncomingPunch[] {
  let rows: unknown = payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "punches" in payload) rows = (payload as Record<string, unknown>).punches;
  const records: unknown[] = Array.isArray(rows) ? rows : [rows];
  if (records.length === 0 || records.length > 500) throw new Error("Send 1–500 punch records per request.");
  return records.map((raw, index) => {
    try {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Punch record must be an object.");
      const row = raw as Record<string, unknown>;
      const employeeCode = punchCode(field(row, ["EmployeeCode", "employeeCode", "Cardno", "CardNo", "E_Code"]));
      if (!employeeCode) throw new Error("EmployeeCode is required.");
      const punchedAt = parsePunchTime(field(row, ["PunchDateAndTime", "punchedAt", "Punchtime", "LogDateTime"]));
      const rawDirection = field(row, ["PunchMode", "direction", "Direction", "PunchType", "VerifyMode"]);
      if (typeof rawDirection !== "string" && typeof rawDirection !== "number") throw new Error("Invalid punch direction.");
      const mode = String(rawDirection).trim().toUpperCase();
      // Never assume vendor numeric codes or last-punch=OUT without confirmation.
      const direction: PunchDirection = ["IN", "CHECKIN", "CHECK-IN"].includes(mode) ? "IN" : ["OUT", "CHECKOUT", "CHECK-OUT"].includes(mode) ? "OUT" : "UNKNOWN";
      const device = field(row, ["SerialNo", "DeviceSerialNumber", "DeviceId", "DevicesId", "deviceId"]);
      if ((typeof device !== "string" && typeof device !== "number") || !String(device).trim() || String(device).length > 128) throw new Error("A device serial number or DeviceId is required.");
      return { employeeCode, punchedAt, direction, deviceId: String(device).trim() };
    } catch (e) { throw new Error(`Record ${index + 1}: ${e instanceof Error ? e.message : "Invalid punch."}`); }
  });
}

export function punchId(employeeId: string, punch: IncomingPunch) {
  return createHash("sha256").update(JSON.stringify([employeeId, punch.punchedAt.toISOString(), punch.direction, punch.deviceId])).digest("hex");
}

export function punchMonthRange(monthYear: string) {
  if (!/^(0[1-9]|1[0-2])\/\d{4}$/.test(monthYear)) throw new Error("Invalid month.");
  const [month, year] = monthYear.split("/").map(Number);
  if (year < 2026 || year > 2100) throw new Error("Invalid year.");
  const start = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00+05:30`);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return { start, end: new Date(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+05:30`) };
}
