import ExcelJS from "exceljs";

export type AttendanceCode = "P" | "A" | "R" | "H" | "SL";
export type AttendanceDays = Record<string, AttendanceCode>;
export type AttendanceRow = { sheet: string; row: number; employeeCode: string; name: string; days: AttendanceDays };
export type AttendanceIssue = { sheet: string; row: number; employeeCode: string; name: string; reason: string };

function raw(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    if ("result" in value) return value.result;
    if ("richText" in value) return value.richText.map(part => part.text).join("");
    if ("text" in value) return value.text;
  }
  return value;
}

// Excel stores fills as RGB, indexed colours or workbook-theme colours.
// Only a grey-filled P is Short Leave; grey H remains Half Day.
function greyFill(cell: ExcelJS.Cell, theme: string) {
  const fill = cell.fill;
  if (!fill || fill.type !== "pattern" || fill.pattern !== "solid" || !fill.fgColor) return false;
  const color = fill.fgColor as Partial<ExcelJS.Color> & { tint?: number; indexed?: number };
  let hex = color.argb?.slice(-6);
  if (!hex && color.indexed !== undefined) {
    hex = ({ 22: "C0C0C0", 23: "808080", 55: "969696", 63: "333333" } as Record<number, string>)[color.indexed];
  }
  if (!hex && color.theme !== undefined) {
    const tag = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"][color.theme];
    if (tag) {
      const block = theme.match(new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${tag}>`))?.[1];
      hex = block?.match(/(?:lastClr|val)=["']([A-Fa-f0-9]{6})["']/)?.[1];
    }
  }
  if (!hex || !/^[A-Fa-f0-9]{6}$/.test(hex)) return false;
  const tint = color.tint ?? 0;
  const rgb = [0, 2, 4].map(offset => {
    const channel = parseInt(hex!.slice(offset, offset + 2), 16);
    return tint < 0 ? channel * (1 + tint) : channel * (1 - tint) + 255 * tint;
  });
  const light = rgb.reduce((sum, value) => sum + value, 0) / 3;
  return light > 15 && light < 245 && Math.max(...rgb) - Math.min(...rgb) <= 10;
}

function headerDate(value: unknown, date1904: boolean): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "number" && value > 20000 && value < 80000) {
    return new Date(Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30) + Math.floor(value) * 86400000);
  }
  if (typeof value === "string") {
    const m = value.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m) {
      const date = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
      if (date.getUTCFullYear() === +m[3] && date.getUTCMonth() === +m[2] - 1 && date.getUTCDate() === +m[1]) return date;
    }
  }
  return null;
}

function attendanceHeader(ws: ExcelJS.Worksheet, monthYear: string, date1904: boolean) {
  for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
    const dates: Array<{ column: number; day: number }> = [];
    ws.getRow(r).eachCell((cell, column) => {
      const date = headerDate(raw(cell), date1904);
      if (date && `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}` === monthYear) dates.push({ column, day: date.getUTCDate() });
    });
    if (dates.length < 20) continue;
    let codeColumn = 0;
    let nameColumn = 0;
    ws.getRow(r).eachCell((cell, column) => {
      const heading = String(raw(cell) ?? "").toLowerCase().replace(/[^a-z]/g, "");
      const text = `${heading}${String(raw(ws.getRow(r + 1).getCell(column)) ?? "")}`.toLowerCase().replace(/[^a-z]/g, "");
      if (text.includes("employeename")) nameColumn = column;
      if (text.includes("employeecode") || text.includes("employeeid") || heading === "employee") codeColumn = column;
    });
    if (nameColumn) return { header: r, dates, codeColumn, nameColumn };
  }
  return null;
}

export async function parseAttendanceExcel(file: File, monthYear: string) {
  if (!/^\d{2}\/\d{4}$/.test(monthYear) || +monthYear.slice(0, 2) < 1 || +monthYear.slice(0, 2) > 12) throw new Error("Invalid calendar month.");
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Please select an .xlsx attendance file.");
  if (!file.size || file.size > 4 * 1024 * 1024) throw new Error("Excel file must be between 1 byte and 4 MB.");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const theme = (workbook.model as unknown as { themes?: Record<string, string> }).themes?.theme1 ?? "";
  const rows: AttendanceRow[] = [];
  const issues: AttendanceIssue[] = [];
  let sheets = 0;
  for (const ws of workbook.worksheets) {
    if (ws.rowCount > 5000 || ws.columnCount > 200) throw new Error("Attendance sheet is too large (maximum 5000 rows and 200 columns).");
    const found = attendanceHeader(ws, monthYear, Boolean(workbook.properties.date1904));
    if (!found) continue;
    const { header, dates, codeColumn, nameColumn } = found;
    const [month, year] = monthYear.split("/").map(Number);
    const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (dates.length !== dayCount || new Set(dates.map(d => d.day)).size !== dayCount) throw new Error(`${ws.name}: expected one date column for every day of ${monthYear}.`);
    sheets++;
    for (let r = header + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const name = String(raw(row.getCell(nameColumn)) ?? "").trim();
      const employeeCode = codeColumn ? String(raw(row.getCell(codeColumn)) ?? "").trim() : "";
      if (!name && !employeeCode && !dates.some(date => String(raw(row.getCell(date.column)) ?? "").trim())) continue;
      // Header continuation row is not an employee.
      if (/^code$/i.test(employeeCode)) continue;
      const identity = { sheet: ws.name, row: r, name, employeeCode };
      if (!name) { issues.push({ ...identity, reason: "Employee name missing; row skipped." }); continue; }
      const days: AttendanceDays = {};
      let invalid = "";
      for (const date of dates) {
        const status = String(raw(row.getCell(date.column)) ?? "").trim().toUpperCase();
        if (!status) continue; // Missing data is never inferred as absence.
        if (!["P", "A", "R", "H"].includes(status)) { invalid = `Unsupported status '${status}' on day ${date.day}; row skipped.`; break; }
        days[String(date.day)] = status === "P" && greyFill(row.getCell(date.column), theme) ? "SL" : status as AttendanceCode;
      }
      if (invalid || !Object.keys(days).length) { issues.push({ ...identity, reason: invalid || "No attendance values; row skipped." }); continue; }
      rows.push({ ...identity, days });
    }
  }
  if (!sheets) throw new Error(`No attendance sheet found for ${monthYear}. Open that file's month in the calendar, then upload. Expected Employee Name and full date headers; Employee Code is optional.`);
  return { rows, issues };
}

export function matchAttendanceRows(
  rows: AttendanceRow[],
  employees: Array<{ id: string; employeeCode: string | null; name: string }>,
  issues: AttendanceIssue[]
) {
  const normalizeName = (name: string) => name.normalize("NFKC").trim().toLocaleLowerCase("en-IN").replace(/\s+/g, " ");
  const byCode = new Map<string, typeof employees>();
  const byName = new Map<string, typeof employees>();
  const codeCounts = new Map<string, number>();
  for (const row of rows) if (row.employeeCode) codeCounts.set(row.employeeCode, (codeCounts.get(row.employeeCode) || 0) + 1);
  for (const employee of employees) {
    const code = employee.employeeCode?.trim();
    if (code) byCode.set(code, [...(byCode.get(code) || []), employee]);
    const name = normalizeName(employee.name);
    if (name) byName.set(name, [...(byName.get(name) || []), employee]);
  }
  const candidates: Array<{ row: AttendanceRow; employeeId: string }> = [];
  const reject = (row: AttendanceRow, reason: string) => issues.push({ sheet: row.sheet, row: row.row, name: row.name, employeeCode: row.employeeCode, reason });
  for (const row of rows) {
    let employee: typeof employees[number] | undefined;
    if (row.employeeCode) {
      if ((codeCounts.get(row.employeeCode) || 0) > 1) { reject(row, "Duplicate employee code in upload; resolve duplicates."); continue; }
      const matches = byCode.get(row.employeeCode) || [];
      if (matches.length !== 1) { reject(row, "Employee code not found or not unique; correct code, or leave it blank to match by name."); continue; }
      employee = matches[0];
      if (normalizeName(employee.name) !== normalizeName(row.name)) { reject(row, `Code/name mismatch. Dashboard name for this code: ${employee.name}`); continue; }
    } else {
      const matches = byName.get(normalizeName(row.name)) || [];
      if (matches.length !== 1) { reject(row, matches.length ? "Multiple employees have this name; add the correct employee code." : "Employee name not found; correct the name."); continue; }
      employee = matches[0];
    }
    candidates.push({ row, employeeId: employee.id });
  }
  const targetCounts = new Map<string, number>();
  for (const item of candidates) targetCounts.set(item.employeeId, (targetCounts.get(item.employeeId) || 0) + 1);
  return candidates.filter(item => {
    if ((targetCounts.get(item.employeeId) || 0) <= 1) return true;
    reject(item.row, "Multiple upload rows match the same employee; resolve duplicates.");
    return false;
  }).map(item => ({ employeeId: item.employeeId, days: item.row.days }));
}

// A correction file contains only skipped rows, with attendance and fills intact.
export async function unmatchedAttendanceExcel(file: File, monthYear: string, issues: AttendanceIssue[]) {
  const source = new ExcelJS.Workbook();
  await source.xlsx.load(await file.arrayBuffer());
  const output = new ExcelJS.Workbook();
  // Carry the workbook theme so theme-based grey Short Leave fills stay correct.
  const sourceThemes = (source.model as unknown as { themes?: unknown }).themes;
  const outputModel = output.model;
  (outputModel as unknown as { themes?: unknown }).themes = sourceThemes;
  output.model = outputModel;
  const ws = output.addWorksheet("Attendance");
  const [month, year] = monthYear.split("/").map(Number);
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  ws.addRow(["S. No.", "Employee Name", "Employee Code", ...Array.from({ length: dayCount }, (_, i) => new Date(Date.UTC(year, month - 1, i + 1))), "Source Sheet", "Source Row", "Issue"]);
  const weekday = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" });
  ws.addRow(["", "", "", ...Array.from({ length: dayCount }, (_, i) => weekday.format(new Date(Date.UTC(year, month - 1, i + 1))))]);
  for (const issue of issues) {
    const sourceSheet = source.getWorksheet(issue.sheet);
    const header = sourceSheet && attendanceHeader(sourceSheet, monthYear, Boolean(source.properties.date1904));
    if (!sourceSheet || !header) throw new Error("Could not locate the original attendance row.");
    const row = ws.addRow([ws.rowCount - 1, issue.name, issue.employeeCode]);
    for (const date of header.dates) {
      const original = sourceSheet.getRow(issue.row).getCell(date.column);
      const target = row.getCell(date.day + 3);
      const value = raw(original);
      target.value = value === null || value === undefined ? null : String(value);
      if (original.fill) target.fill = JSON.parse(JSON.stringify(original.fill));
    }
    row.getCell(dayCount + 4).value = issue.sheet;
    row.getCell(dayCount + 5).value = issue.row;
    row.getCell(dayCount + 6).value = issue.reason;
  }
  ws.views = [{ state: "frozen", xSplit: 3, ySplit: 2 }];
  ws.getColumn(1).width = 8; ws.getColumn(2).width = 30; ws.getColumn(3).width = 17;
  for (let day = 1; day <= dayCount; day++) { ws.getColumn(day + 3).width = 9; ws.getRow(1).getCell(day + 3).numFmt = "dd-mmm"; }
  ws.getColumn(dayCount + 4).width = 30; ws.getColumn(dayCount + 5).width = 12; ws.getColumn(dayCount + 6).width = 70;
  ws.getRow(1).font = { bold: true };
  return output.xlsx.writeBuffer();
}
