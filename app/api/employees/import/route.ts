import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { cleanMonthYear, excelCell, fail, ok, parseDate } from "@/lib/utils";
import { addAuditLog } from "@/lib/audit";
import { addSystemNotification } from "@/lib/systemNotification";

async function rowsFromExcel(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const ws = wb.worksheets[0];
  const headerRow = ws.getRow(1);
  const headers = headerRow.values as any[];
  const rows: Record<string, any>[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const obj: Record<string, any> = {};
    headers.forEach((h, idx) => {
      if (!h || idx === 0) return;
      obj[String(h).trim()] = row.getCell(idx).value as any;
    });
    rows.push(obj);
  });
  return rows;
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!["ADMIN", "HR"].includes(session.role)) throw new Error("Only Admin/HR allowed.");
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) throw new Error("Excel file required.");
    const rows = await rowsFromExcel(file);
    let added = 0, updated = 0, skipped = 0;
    const seen = new Set<string>();

    for (const r of rows) {
      const name = String(excelCell(r, ["Name", "Employee Name", "Name of Employee"])).trim();
      const mobile = String(excelCell(r, ["Mobile", "Mobile No.", "Username / Mobile", "Number"])).trim();
      if (!name || !mobile) { skipped++; continue; }
      const key = mobile.replace(/\D/g, "") || `${name}-${mobile}`;
      if (seen.has(key)) { skipped++; continue; }
      seen.add(key);

      const old = await prisma.employee.findUnique({ where: { mobile } });
      if (old?.deletedAt) { skipped++; continue; }
      const plainPass = String(excelCell(r, ["Password"]) || "1234").trim() || "1234";
      const data = {
        name,
        mobile,
        password: await bcrypt.hash(plainPass, 10),
        role: String(excelCell(r, ["Role"]) || "Employee").toUpperCase().includes("HR") ? "HR" as const : "EMPLOYEE" as const,
        designation: String(excelCell(r, ["Designation", "Post"]) || "").trim(),
        department: String(excelCell(r, ["Department"]) || "").trim(),
        dob: parseDate(excelCell(r, ["DOB", "Date of Birth"])),
        doj: parseDate(excelCell(r, ["DOJ", "Date of Joining"])),
        exitDate: parseDate(excelCell(r, ["Exit Date", "ExitDate", "Leave Date"])),
        status: String(excelCell(r, ["Status"]) || "Active").toLowerCase().includes("inactive") ? "INACTIVE" as const : "ACTIVE" as const
      };
      await prisma.employee.upsert({ where: { mobile }, update: data, create: data });
      old ? updated++ : added++;
    }

    await addAuditLog({ actorId: session.id, actorName: session.name, action: "IMPORT_EMPLOYEES", target: "Employee Excel", details: { added, updated, skipped, total: rows.length } });
    await addSystemNotification({
      actorId: session.id,
      action: "IMPORT_EMPLOYEES",
      text: `Bulk employee import completed by ${session.name}: ${added} added, ${updated} updated, ${skipped} skipped.`
    });
    return ok({ added, updated, skipped, total: rows.length });
  } catch (e) { return fail(e); }
}
