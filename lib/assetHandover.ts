import { requireSession } from "@/lib/auth";
import { requireHrPermission } from "@/lib/permissions";

export const assetTypes = ["MOBILE", "LAPTOP", "SIM", "PEN_DRIVE", "OTHER"] as const;
export class AssetError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export async function assetAccess(write = false) {
  let session;
  try { session = await requireSession(); }
  catch (e) { throw new AssetError(e instanceof Error && e.message === "Password change required." ? e.message : "Please log in again.", 401); }
  if (session.role !== "ADMIN" && session.role !== "HR") throw new AssetError("Only Admin/HR can access Asset Handover.", 403);
  try {
    await requireHrPermission(session.role, "hrMenuAssetHandover", "Asset Handover is not available for HR.");
    if (write) await requireHrPermission(session.role, "hrCanManageAssetHandover", "HR can view but cannot change handovers.");
  } catch (e) { throw new AssetError(e instanceof Error ? e.message : "Access denied.", 403); }
  return session;
}
export function assetFailure(error: unknown) {
  const e = error as { code?: string };
  const status = error instanceof AssetError ? error.status : e?.code === "P2002" ? 409 : e?.code === "P2021" || e?.code === "P2022" ? 503 : 500;
  const message = error instanceof AssetError ? error.message : status === 409 ? "This item type and identifier already exist. Open that handover and transfer or reassign it."
    : status === 503 ? "Asset Handover setup pending. Apply prisma/asset-handovers.sql to the dashboard database." : "Could not complete the handover request. Refresh and try again.";
  return Response.json({ ok: false, error: message }, { status, headers: { "Cache-Control": "private, no-store" } });
}
export function assetText(value: unknown, label: string, max = 200, required = false) {
  if (value !== null && value !== undefined && typeof value !== "string") throw new AssetError(`${label} must be text.`);
  const text = String(value ?? "").trim();
  if (required && !text) throw new AssetError(`${label} is required.`);
  if (text.length > max) throw new AssetError(`${label} must be ${max} characters or less.`);
  return text;
}
export function indiaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join("-");
}
export function assetDate(value: unknown) {
  const text = assetText(value, "Date", 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new AssetError("Choose a valid date.");
  const date = new Date(`${text}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text || text > indiaDate()) throw new AssetError("Choose a valid date on or before today.");
  return date;
}
export function assetFields(form: FormData) {
  const itemType = assetText(form.get("itemType"), "Item type", 20, true);
  if (!(assetTypes as readonly string[]).includes(itemType)) throw new AssetError("Choose a valid item type.");
  const identifier = assetText(form.get("identifier"), "Serial / IMEI / mobile number", 120) || null;
  return {
    itemType, itemName: assetText(form.get("itemName"), "Item details", 200, true), identifier,
    identifierKey: identifier ? `${itemType}:${identifier.toUpperCase().replace(/\s+/g, "")}` : null,
    condition: assetText(form.get("condition"), "Condition", 200, true),
    accessories: assetText(form.get("accessories"), "Accessories", 500), remarks: assetText(form.get("remarks"), "Remarks", 2000)
  };
}
export async function assetAttachment(form: FormData) {
  const entry = form.get("attachment");
  if (!entry || typeof entry === "string") { if (entry) throw new AssetError("Choose a valid receipt/photo."); return null; }
  if (!entry.size) return null;
  if (entry.size > 4 * 1024 * 1024) throw new AssetError("Receipt/photo must be 4 MB or smaller.");
  const data = Buffer.from(await entry.arrayBuffer());
  const fileType = data.subarray(0, 5).toString() === "%PDF-" ? "application/pdf"
    : data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "image/png"
    : data[0] === 255 && data[1] === 216 && data[2] === 255 ? "image/jpeg"
    : data.subarray(0, 4).toString() === "RIFF" && data.subarray(8, 12).toString() === "WEBP" ? "image/webp" : null;
  if (!fileType) throw new AssetError("Only genuine PDF, JPG, PNG or WEBP files are allowed.");
  return { fileName: entry.name.replace(/[\r\n"\\/]/g, "_").slice(0, 180) || "receipt", fileType, fileSize: data.length, fileData: data };
}
