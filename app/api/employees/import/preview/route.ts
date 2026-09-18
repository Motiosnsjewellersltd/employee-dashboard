import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { excelCell, fail, ok } from "@/lib/utils";
import { requireHrPermission } from "@/lib/permissions";

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
    await requireHrPermission(session.role, "hrCanAddEmployee", "HR is not allowed to import employees.");
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) throw new Error("Excel file required.");
    const rows = await rowsFromExcel(file);
    const existing = await prisma.employee.findMany({ select: { id: true, employeeCode: true, mobile: true, deletedAt: true } });
    const activeByMobile = new Map(existing.filter(e => !e.deletedAt).map(e => [e.mobile, e]));
    const activeByCode = new Map(existing.filter(e => !e.deletedAt && e.employeeCode).map(e => [e.employeeCode as string, e]));
    const recycledMobiles = new Set(existing.filter(e => !!e.deletedAt).map(e => e.mobile));
    const recycledCodes = new Set(existing.filter(e => !!e.deletedAt && e.employeeCode).map(e => e.employeeCode as string));
    const seenMobiles = new Set<string>();
    const seenCodes = new Set<string>();
    const errors: any[] = [];
    let add = 0, update = 0, skipped = 0;

    rows.forEach((r, i) => {
      const row = i + 2;
      const employeeCode = String(excelCell(r, ["Employee ID", "EmployeeID", "Emp ID", "EmpID"]) || "").trim();
      const name = String(excelCell(r, ["Name", "Employee Name", "Name of Employee"])).trim();
      const mobile = String(excelCell(r, ["Mobile", "Mobile No.", "Username / Mobile", "Number"])).trim();
      const branch = String(excelCell(r, ["Branch", "Store"]) || "").trim().toUpperCase();
      if (!name || !mobile) { skipped++; errors.push({ row, reason: "Name or mobile missing" }); return; }
      if (employeeCode && !/^\d+$/.test(employeeCode)) { skipped++; errors.push({ row, reason: "Employee ID must contain numbers only", employeeCode }); return; }
      if (branch && !["MT", "JB", "VN"].includes(branch)) { skipped++; errors.push({ row, reason: "Branch must be MT, JB or VN", mobile }); return; }
      if (seenMobiles.has(mobile)) { skipped++; errors.push({ row, reason: "Duplicate mobile in Excel", mobile }); return; }
      if (employeeCode && seenCodes.has(employeeCode)) { skipped++; errors.push({ row, reason: "Duplicate Employee ID in Excel", employeeCode }); return; }
      seenMobiles.add(mobile);
      if (employeeCode) seenCodes.add(employeeCode);
      if (recycledMobiles.has(mobile)) { skipped++; errors.push({ row, reason: "Employee with this mobile is in Recycle Bin. Restore first.", mobile }); return; }
      if (employeeCode && recycledCodes.has(employeeCode)) { skipped++; errors.push({ row, reason: "Employee ID is in Recycle Bin. Restore first.", employeeCode }); return; }
      const byMobile = activeByMobile.get(mobile);
      const byCode = employeeCode ? activeByCode.get(employeeCode) : undefined;
      if (byMobile && byCode && byMobile.id !== byCode.id) { skipped++; errors.push({ row, reason: "Employee ID and mobile belong to different employees", employeeCode, mobile }); return; }
      byMobile || byCode ? update++ : add++;
    });

    return ok({ total: rows.length, add, update, skipped, errors: errors.slice(0, 100) });
  } catch (e) { return fail(e); }
}
