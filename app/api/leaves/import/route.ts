import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/utils";
import { addAuditLog } from "@/lib/audit";
import { addSystemNotification } from "@/lib/systemNotification";
import { compactName, normalizeName, onlyDigits, rowsFromLeaveExcel } from "@/lib/leaveImport";

export async function POST(req: NextRequest) {
  let session: Awaited<ReturnType<typeof requireSession>> | null = null;
  try {
    session = await requireSession();
    if (!["ADMIN", "HR"].includes(session.role)) throw new Error("Only Admin/HR allowed.");

    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) throw new Error("Leave Excel file required.");

    const rows = await rowsFromLeaveExcel(file);
    const employees = await prisma.employee.findMany({
      where: { role: { not: "ADMIN" }, deletedAt: null },
      select: { id: true, name: true, mobile: true }
    });

    type EmployeeLookup = { id: string; name: string; mobile: string | null };
    const byId = new Map<string, EmployeeLookup>();
    const byMobile = new Map<string, EmployeeLookup>();
    const byName = new Map<string, EmployeeLookup>();
    const byCompactName = new Map<string, EmployeeLookup>();
    for (const e of employees) {
      byId.set(String(e.id), e);
      const mobile = onlyDigits(e.mobile);
      if (mobile) byMobile.set(mobile, e);
      const name = normalizeName(e.name);
      if (name) byName.set(name, e);
      const compact = compactName(e.name);
      if (compact) byCompactName.set(compact, e);
    }

    const seen = new Map<string, { employeeId: string; monthYear: string; leave: number }>();
    const missing = new Set<string>();
    let skipped = 0;
    let duplicatesInFile = 0;

    for (const r of rows) {
      if (!r.monthYear || !Number.isFinite(r.leave) || r.leave < 0) {
        skipped++;
        continue;
      }
      const emp =
        byId.get(r.employeeId) ||
        byMobile.get(r.mobile) ||
        byName.get(normalizeName(r.employeeName)) ||
        byCompactName.get(compactName(r.employeeName));
      if (!emp) {
        skipped++;
        missing.add(r.employeeName || r.mobile || r.employeeId || `Row ${r.row}`);
        continue;
      }
      const key = `${emp.id}|${r.monthYear}`;
      if (seen.has(key)) duplicatesInFile++;
      seen.set(key, { employeeId: emp.id, monthYear: r.monthYear, leave: r.leave });
    }

    const items = Array.from(seen.values());
    const employeeIds = Array.from(new Set(items.map(x => x.employeeId)));
    const months = Array.from(new Set(items.map(x => x.monthYear)));
    const existing = items.length ? await prisma.leaveRecord.findMany({
      where: { employeeId: { in: employeeIds }, monthYear: { in: months }, deletedAt: null },
      select: { employeeId: true, monthYear: true }
    }) : [];
    const existingKeys = new Set(existing.map(x => `${x.employeeId}|${x.monthYear}`));
    const updated = items.filter(x => existingKeys.has(`${x.employeeId}|${x.monthYear}`)).length;
    const added = items.length - updated;

    for (let i = 0; i < items.length; i += 100) {
      const chunk = items.slice(i, i + 100);
      await prisma.$transaction(chunk.map(item => prisma.leaveRecord.upsert({
        where: { employeeId_monthYear: { employeeId: item.employeeId, monthYear: item.monthYear } },
        update: { leave: item.leave, deletedAt: null, deletedById: null, deletedByName: null },
        create: item
      })));
    }

    await addAuditLog({
      actorId: session.id,
      actorName: session.name,
      action: "UPLOAD_LEAVES",
      target: file.name,
      details: { totalRows: rows.length, added, updated, skipped, duplicatesInFile }
    });
    await addSystemNotification({
      actorId: session.id,
      action: "UPLOAD_LEAVES",
      text: `Leave upload completed by ${session.name}: ${added} new, ${updated} updated, ${skipped} skipped.`
    });

    return ok({
      totalRows: rows.length,
      saved: items.length,
      added,
      updated,
      skipped,
      duplicatesInFile,
      missingCount: missing.size,
      missing: Array.from(missing).slice(0, 80)
    });
  } catch (e) {
    if (session && ["ADMIN", "HR"].includes(session.role)) {
      await addSystemNotification({
        actorId: session.id,
        action: "LEAVE_UPLOAD_FAILED",
        text: `Leave upload failed for ${session.name}: ${e instanceof Error ? e.message : "Unknown error"}.`,
        type: "NOTICE"
      });
    }
    return fail(e);
  }
}
