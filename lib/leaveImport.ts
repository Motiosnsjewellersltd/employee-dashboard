import ExcelJS from "exceljs";

export type ParsedLeaveRow = {
  row: number;
  monthYear: string;
  employeeId: string;
  employeeName: string;
  mobile: string;
  leave: number;
};

export function normalizeName(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "");
}

export function compactName(value: unknown) {
  return normalizeName(value).replace(/\s+/g, "");
}

export function onlyDigits(value: unknown) {
  return String(value || "").replace(/\D/g, "");
}

function excelSerialToDate(value: number) {
  const base = Date.UTC(1899, 11, 30);
  return new Date(base + value * 86400000);
}

export function normalizeMonthYear(value: unknown) {
  if (value === null || value === undefined || value === "") return "";

  if (value instanceof Date && !isNaN(value.getTime())) {
    return `${String(value.getMonth() + 1).padStart(2, "0")}/${value.getFullYear()}`;
  }

  if (typeof value === "number" && value > 20000 && value < 80000) {
    const d = excelSerialToDate(value);
    return `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  }

  const s = String(value).trim();
  if (!s) return "";
  if (/^\d{5}$/.test(s)) return normalizeMonthYear(Number(s));

  let m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) {
    const month = Number(m[1]);
    return month >= 1 && month <= 12 ? `${String(month).padStart(2, "0")}/${m[2]}` : "";
  }

  m = s.match(/^(\d{1,2})-(\d{4})$/);
  if (m) {
    const month = Number(m[1]);
    return month >= 1 && month <= 12 ? `${String(month).padStart(2, "0")}/${m[2]}` : "";
  }

  m = s.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (m) {
    const month = Number(m[2]);
    return month >= 1 && month <= 12 ? `${String(month).padStart(2, "0")}/${m[3]}` : "";
  }

  m = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m) {
    const month = Number(m[2]);
    return month >= 1 && month <= 12 ? `${String(month).padStart(2, "0")}/${m[1]}` : "";
  }

  return "";
}

function cellRaw(cell: ExcelJS.Cell) {
  const value: any = cell.value;
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if (value.result !== undefined) return value.result;
    if (value.text !== undefined) return value.text;
    if (value.richText && Array.isArray(value.richText)) return value.richText.map((r: any) => r.text || "").join("");
    if (value.hyperlink && value.text) return value.text;
  }
  return value;
}

function headerKey(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getValue(row: Record<string, unknown>, names: string[]) {
  const wanted = names.map(headerKey);
  const key = Object.keys(row).find(k => wanted.includes(headerKey(k)));
  return key ? row[key] : "";
}

function sheetRows(ws: ExcelJS.Worksheet) {
  const headerRow = ws.getRow(1);
  const headerMap = new Map<number, string>();

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = String(cellRaw(cell) || "").trim();
    if (header) headerMap.set(colNumber, header);
  });

  const headers = Array.from(headerMap.values()).map(headerKey);
  const hasLeaveHeaders =
    headers.some(h => h === "monthyear" || h === "month" || h === "mmyyyy") &&
    headers.some(h => h === "employeename" || h === "name" || h === "nameofemployee") &&
    headers.some(h => h === "leave" || h === "leaves" || h === "noofleaves");

  if (!hasLeaveHeaders) return [];

  const rows: Array<{ row: number; values: Record<string, unknown> }> = [];
  const lastRow = ws.actualRowCount || ws.rowCount;
  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber++) {
    const row = ws.getRow(rowNumber);
    const obj: Record<string, unknown> = {};
    let hasValue = false;
    headerMap.forEach((header, colNumber) => {
      const value = cellRaw(row.getCell(colNumber));
      if (value !== "" && value !== null && value !== undefined) hasValue = true;
      obj[header] = value;
    });
    if (hasValue) rows.push({ row: rowNumber, values: obj });
  }
  return rows;
}

export async function rowsFromLeaveExcel(file: File): Promise<ParsedLeaveRow[]> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Only .xlsx file is supported for leave upload.");
  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);

  const candidates = wb.worksheets.map(ws => ({ ws, rows: sheetRows(ws) })).filter(x => x.rows.length);
  if (!candidates.length) {
    throw new Error("Leave Excel me required headers nahi mile. Headers rakho: Month/Year, Employee Name, Leave");
  }
  candidates.sort((a, b) => b.rows.length - a.rows.length);

  return candidates[0].rows.map(({ row, values }) => {
    const leaveRaw = getValue(values, ["Leave", "Leaves", "No of Leaves"]);
    return {
      row,
      monthYear: normalizeMonthYear(getValue(values, ["Month/Year", "MonthYear", "Month", "mm/yyyy"])),
      employeeId: String(getValue(values, ["EmployeeID", "Employee ID", "ID"]) || "").trim(),
      employeeName: String(getValue(values, ["Employee Name", "Name", "Name of Employee"]) || "").trim(),
      mobile: onlyDigits(getValue(values, ["Mobile", "Mobile No.", "Username / Mobile"])),
      leave: Number(leaveRaw)
    };
  });
}
