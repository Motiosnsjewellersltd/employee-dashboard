import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { excelCell, fail, ok } from "@/lib/utils";

async function rowsFromExcel(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const ws = wb.worksheets[0];
  const headers = ws.getRow(1).values as any[];
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
    const existing = await prisma.employee.findMany({ select: { mobile: true, deletedAt: true } });
    const existingMobiles = new Set(existing.filter(e => !e.deletedAt).map(e => e.mobile));
    const recycledMobiles = new Set(existing.filter(e => !!e.deletedAt).map(e => e.mobile));
    const seen = new Set<string>();
    const errors: any[] = [];
    let add = 0, update = 0, skipped = 0;

    rows.forEach((r, i) => {
      const row = i + 2;
      const name = String(excelCell(r, ["Name", "Employee Name", "Name of Employee"])).trim();
      const mobile = String(excelCell(r, ["Mobile", "Mobile No.", "Username / Mobile", "Number"])).trim();
      if (!name || !mobile) { skipped++; errors.push({ row, reason: "Name or mobile missing" }); return; }
      if (seen.has(mobile)) { skipped++; errors.push({ row, reason: "Duplicate mobile in Excel", mobile }); return; }
      seen.add(mobile);
      if (recycledMobiles.has(mobile)) { skipped++; errors.push({ row, reason: "Employee with this mobile is in Recycle Bin. Restore first.", mobile }); return; }
      existingMobiles.has(mobile) ? update++ : add++;
    });

    return ok({ total: rows.length, add, update, skipped, errors: errors.slice(0, 100) });
  } catch (e) { return fail(e); }
}
