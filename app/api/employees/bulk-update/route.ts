import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fail, ok, parseDate } from "@/lib/utils";
import { requireHrPermission } from "@/lib/permissions";
import { addAuditLog } from "@/lib/audit";
import { addSystemNotification } from "@/lib/systemNotification";

const updateActions = {
  CHANGE_EMPLOYEE_CODE: { header: "Employee ID", file: "employee-id" },
  CHANGE_DEPARTMENT: { header: "Department", file: "department" },
  CHANGE_DESIGNATION: { header: "Designation", file: "designation" },
  CHANGE_DOJ: { header: "Joining Date (dd-mm-yyyy)", file: "joining-date" },
  CHANGE_BRANCH: { header: "Branch (MT/JB/VN)", file: "branch" },
  CHANGE_EXIT_DATE: { header: "Exit / Leave Date (dd-mm-yyyy)", file: "exit-leave-date" }
} as const;

type UpdateAction = keyof typeof updateActions;

function getAction(value: unknown): UpdateAction {
  const action = String(value || "").trim() as UpdateAction;
  if (!updateActions[action]) throw new Error("Choose a valid change option.");
  return action;
}

function cleanIds(value: unknown) {
  const values = Array.isArray(value) ? value : String(value || "").split(",");
  return Array.from(new Set(values.map(String).map(item => item.trim()).filter(Boolean)));
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const value: any = cell.value;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    if ("result" in value) return value.result;
    if ("text" in value) return value.text;
    if (Array.isArray(value.richText)) return value.richText.map((part: any) => part.text || "").join("");
  }
  return value;
}

function strictDate(value: unknown) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }
  return parseDate(value);
}

async function requireBulkEditor() {
  const session = await requireSession();
  if (!["ADMIN", "HR"].includes(session.role)) throw new Error("Only Admin/HR allowed.");
  await requireHrPermission(session.role, "hrCanEditEmployee", "HR is not allowed to edit employees.");
  return session;
}

export async function GET(req: NextRequest) {
  try {
    await requireBulkEditor();
    const url = new URL(req.url);
    const action = getAction(url.searchParams.get("action"));
    const ids = cleanIds(url.searchParams.get("ids"));
    if (!ids.length) throw new Error("Select at least one employee.");

    const employees = await prisma.employee.findMany({
      where: { id: { in: ids }, role: { not: "ADMIN" }, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" }
    });
    if (!employees.length) throw new Error("No eligible employees selected.");

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Motisons Employee System";
    const sheet = workbook.addWorksheet("Bulk Update", { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = [
      { header: "Employee Name", key: "name", width: 34 },
      { header: updateActions[action].header, key: "value", width: 30 },
      { header: "System Record ID", key: "id", width: 28, hidden: true },
      { header: "Bulk Action", key: "action", width: 24, hidden: true }
    ];
    employees.forEach(employee => sheet.addRow({ name: employee.name, value: "", id: employee.id, action }));
    sheet.getRow(1).height = 24;
    sheet.getRow(1).eachCell(cell => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B5FA5" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    for (let rowNumber = 2; rowNumber <= employees.length + 1; rowNumber++) {
      const valueCell = sheet.getCell(`B${rowNumber}`);
      if (action === "CHANGE_EMPLOYEE_CODE") {
        valueCell.numFmt = "0";
        valueCell.dataValidation = { type: "whole", operator: "between", allowBlank: true, formulae: [1, 999999999], showErrorMessage: true, errorTitle: "Invalid Employee ID", error: "Enter numbers only." };
      }
      if (action === "CHANGE_DOJ" || action === "CHANGE_EXIT_DATE") valueCell.numFmt = "dd-mm-yyyy";
      if (action === "CHANGE_BRANCH") {
        valueCell.dataValidation = { type: "list", allowBlank: true, formulae: ['"MT,JB,VN"'], showErrorMessage: true, errorTitle: "Invalid Branch", error: "Choose MT, JB or VN." };
      }
    }
    sheet.autoFilter = { from: "A1", to: "B1" };

    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(Buffer.from(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="bulk-${updateActions[action].file}-update.xlsx"`
      }
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireBulkEditor();
    const form = await req.formData();
    const action = getAction(form.get("action"));
    const selectedIds = new Set(cleanIds(JSON.parse(String(form.get("ids") || "[]"))));
    const file = form.get("file") as File | null;
    if (!file || !file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Choose the exported .xlsx file.");
    if (!selectedIds.size) throw new Error("Select the employees included in this Excel first.");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await file.arrayBuffer()) as any);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new Error("Excel sheet not found.");
    if (String(cellValue(sheet.getCell("B1")) || "").trim() !== updateActions[action].header) throw new Error("Uploaded Excel does not match the selected bulk action.");

    const rows: { row: number; id: string; value: unknown }[] = [];
    let blank = 0;
    sheet.eachRow((excelRow, rowNumber) => {
      if (rowNumber === 1) return;
      const id = String(cellValue(excelRow.getCell(3)) || "").trim();
      const fileAction = String(cellValue(excelRow.getCell(4)) || "").trim();
      const value = cellValue(excelRow.getCell(2));
      if (!id || fileAction !== action || !selectedIds.has(id)) return;
      if (value === null || value === undefined || String(value).trim() === "") { blank++; return; }
      rows.push({ row: rowNumber, id, value });
    });
    if (!rows.length) throw new Error("No filled values found. Blank rows are ignored.");

    const uniqueIds = Array.from(new Set(rows.map(row => row.id)));
    const employees = await prisma.employee.findMany({
      where: { id: { in: uniqueIds, not: session.id }, role: { not: "ADMIN" }, deletedAt: null },
      select: { id: true, name: true, employeeCode: true, branch: true }
    });
    const employeeMap = new Map(employees.map(employee => [employee.id, employee]));
    const seen = new Set<string>();
    const seenEmployeeCodes = new Set<string>();
    const errors: string[] = [];
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      if (seen.has(row.id)) { skipped++; errors.push(`Row ${row.row}: duplicate employee.`); continue; }
      seen.add(row.id);
      const employee = employeeMap.get(row.id);
      if (!employee) { skipped++; errors.push(`Row ${row.row}: employee not available.`); continue; }
      try {
        if (action === "CHANGE_EMPLOYEE_CODE") {
          const employeeCode = String(row.value).trim();
          if (!/^\d+$/.test(employeeCode)) throw new Error("Employee ID must contain numbers only");
          if (seenEmployeeCodes.has(employeeCode)) throw new Error(`Employee ID ${employeeCode} is repeated in this Excel`);
          seenEmployeeCodes.add(employeeCode);
          const codeOwner = await prisma.employee.findUnique({ where: { employeeCode } });
          if (codeOwner && codeOwner.id !== employee.id) {
            if (codeOwner.deletedAt) throw new Error(`Employee ID ${employeeCode} belongs to an employee in Recycle Bin`);
            throw new Error(`Employee ID ${employeeCode} is already assigned to ${codeOwner.name}`);
          }
          if (employee.employeeCode === employeeCode) { skipped++; continue; }
          await prisma.employee.update({ where: { id: employee.id }, data: { employeeCode } });
        } else if (action === "CHANGE_DEPARTMENT") {
          const department = String(row.value).trim();
          if (!department) throw new Error("department is blank");
          await prisma.employee.update({ where: { id: employee.id }, data: { department } });
        } else if (action === "CHANGE_DESIGNATION") {
          const designation = String(row.value).trim();
          if (!designation) throw new Error("designation is blank");
          await prisma.employee.update({ where: { id: employee.id }, data: { designation } });
        } else if (action === "CHANGE_DOJ") {
          const doj = strictDate(row.value);
          if (!doj) throw new Error("use valid dd-mm-yyyy date");
          await prisma.employee.update({ where: { id: employee.id }, data: { doj } });
        } else if (action === "CHANGE_BRANCH") {
          const branch = String(row.value).trim().toUpperCase();
          if (!["MT", "JB", "VN"].includes(branch)) throw new Error("branch must be MT, JB or VN");
          if ((employee.branch || null) === branch) { skipped++; continue; }
          await prisma.$transaction(async tx => {
            await tx.employee.update({ where: { id: employee.id }, data: { branch } });
            await tx.branchTransfer.create({ data: { employeeId: employee.id, fromBranch: employee.branch || null, toBranch: branch, changedById: session.id, changedByName: session.name } });
          });
        } else if (action === "CHANGE_EXIT_DATE") {
          const exitDate = strictDate(row.value);
          if (!exitDate) throw new Error("use valid dd-mm-yyyy date");
          await prisma.employee.update({ where: { id: employee.id }, data: { exitDate, status: "INACTIVE" } });
        }
        updated++;
      } catch (error) {
        skipped++;
        errors.push(`Row ${row.row} (${employee.name}): ${error instanceof Error ? error.message : "invalid value"}.`);
      }
    }

    if (!updated && errors.length) throw new Error(errors[0]);
    await addAuditLog({ actorId: session.id, actorName: session.name, action: `EXCEL_${action}`, target: `${updated} employees`, details: { updated, blank, skipped, errors: errors.slice(0, 20) } });
    await addSystemNotification({ actorId: session.id, action: `EXCEL_${action}`, text: `${updated} employee${updated === 1 ? "" : "s"} updated through bulk Excel by ${session.name}.` });
    return ok({ updated, blank, skipped, errors: errors.slice(0, 20) });
  } catch (error) {
    return fail(error);
  }
}
