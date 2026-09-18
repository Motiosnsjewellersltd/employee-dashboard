import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { cleanMonthYear, excelCell, fail, ok, parseDate } from "@/lib/utils";
import { addAuditLog } from "@/lib/audit";
import { addSystemNotification } from "@/lib/systemNotification";
import { requireHrPermission } from "@/lib/permissions";

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
    await requireHrPermission(session.role, "hrCanAddEmployee", "HR is not allowed to import employees.");
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file) throw new Error("Excel file required.");
    const rows = await rowsFromExcel(file);
    let added = 0, updated = 0, skipped = 0;
    const seenMobiles = new Set<string>();
    const seenCodes = new Set<string>();

    for (const r of rows) {
      const employeeCode = String(excelCell(r, ["Employee ID", "EmployeeID", "Emp ID", "EmpID"]) || "").trim();
      const name = String(excelCell(r, ["Name", "Employee Name", "Name of Employee"])).trim();
      const mobile = String(excelCell(r, ["Mobile", "Mobile No.", "Username / Mobile", "Number"])).trim();
      if (!name || !mobile) { skipped++; continue; }
      if (employeeCode && !/^\d+$/.test(employeeCode)) { skipped++; continue; }
      const mobileKey = mobile.replace(/\D/g, "") || `${name}-${mobile}`;
      if (seenMobiles.has(mobileKey) || (employeeCode && seenCodes.has(employeeCode))) { skipped++; continue; }
      seenMobiles.add(mobileKey);
      if (employeeCode) seenCodes.add(employeeCode);

      const oldByMobile = await prisma.employee.findUnique({ where: { mobile } });
      const oldByCode = employeeCode ? await prisma.employee.findUnique({ where: { employeeCode } }) : null;
      if (oldByMobile && oldByCode && oldByMobile.id !== oldByCode.id) { skipped++; continue; }
      const old = oldByCode || oldByMobile;
      if (old?.deletedAt) { skipped++; continue; }
      const plainPass = String(excelCell(r, ["Password"]) || "1234").trim() || "1234";
      const rawBranch = String(excelCell(r, ["Branch", "Store"]) || "").trim().toUpperCase();
      if (rawBranch && !["MT", "JB", "VN"].includes(rawBranch)) { skipped++; continue; }
      const exitDate = parseDate(excelCell(r, ["Exit Date", "ExitDate", "Leave Date"]));
      const data = {
        employeeCode: employeeCode || old?.employeeCode || null,
        name,
        mobile,
        password: await bcrypt.hash(plainPass, 10),
        role: String(excelCell(r, ["Role"]) || "Employee").toUpperCase().includes("HR") ? "HR" as const : "EMPLOYEE" as const,
        designation: String(excelCell(r, ["Designation", "Post"]) || "").trim(),
        department: String(excelCell(r, ["Department"]) || "").trim(),
        branch: rawBranch || null,
        dob: parseDate(excelCell(r, ["DOB", "Date of Birth"])),
        doj: parseDate(excelCell(r, ["DOJ", "Date of Joining"])),
        exitDate,
        status: exitDate || String(excelCell(r, ["Status"]) || "Active").toLowerCase().includes("inactive") ? "INACTIVE" as const : "ACTIVE" as const
      };
      await prisma.$transaction(async tx => {
        const employee = old
          ? await tx.employee.update({ where: { id: old.id }, data })
          : await tx.employee.create({ data });
        if (old && (old.branch || null) !== data.branch) {
          await tx.branchTransfer.create({ data: { employeeId: employee.id, fromBranch: old.branch || null, toBranch: data.branch || "UNASSIGNED", changedById: session.id, changedByName: session.name } });
        }
      });
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
