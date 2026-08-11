import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/utils";
import { compactName, normalizeName, onlyDigits, rowsFromLeaveExcel } from "@/lib/leaveImport";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
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

    const valid = new Map<string, { employeeId: string; monthYear: string; leave: number }>();
    const errors: Array<{ row: number; reason: string; name?: string; mobile?: string }> = [];
    let duplicateRows = 0;

    for (const r of rows) {
      if (!r.monthYear) {
        errors.push({ row: r.row, reason: "Invalid Month/Year. Use MM/YYYY, e.g. 08/2026.", name: r.employeeName });
        continue;
      }
      if (!Number.isFinite(r.leave) || r.leave < 0) {
        errors.push({ row: r.row, reason: "Invalid Leave value.", name: r.employeeName });
        continue;
      }

      const emp =
        byId.get(r.employeeId) ||
        byMobile.get(r.mobile) ||
        byName.get(normalizeName(r.employeeName)) ||
        byCompactName.get(compactName(r.employeeName));

      if (!emp) {
        errors.push({ row: r.row, reason: "Employee not matched.", name: r.employeeName, mobile: r.mobile });
        continue;
      }

      const key = `${emp.id}|${r.monthYear}`;
      if (valid.has(key)) duplicateRows++;
      valid.set(key, { employeeId: emp.id, monthYear: r.monthYear, leave: r.leave });
    }

    const items = Array.from(valid.values());
    const employeeIds = Array.from(new Set(items.map(x => x.employeeId)));
    const months = Array.from(new Set(items.map(x => x.monthYear)));
    const existing = items.length ? await prisma.leaveRecord.findMany({
      where: { employeeId: { in: employeeIds }, monthYear: { in: months }, deletedAt: null },
      select: { employeeId: true, monthYear: true }
    }) : [];
    const existingKeys = new Set(existing.map(x => `${x.employeeId}|${x.monthYear}`));
    const updateCount = items.filter(x => existingKeys.has(`${x.employeeId}|${x.monthYear}`)).length;

    return ok({
      totalRows: rows.length,
      validRows: items.length,
      newRecords: items.length - updateCount,
      updates: updateCount,
      duplicatesInFile: duplicateRows,
      skipped: errors.length,
      errors
    });
  } catch (e) {
    return fail(e);
  }
}
