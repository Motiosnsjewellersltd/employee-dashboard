import ExcelJS from "exceljs";

export type AttendanceCode = "P" | "A" | "R" | "H" | "SL";
export type AttendanceDays = Record<string, AttendanceCode>;
export type AttendanceRow = { row: number; employeeCode: string; name: string; days: AttendanceDays };
export type AttendanceIssue = { row: number; name: string; reason: string };

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
  if (fill.type !== "pattern" || fill.pattern !== "solid" || !fill.fgColor) return false;
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

export async function parseAttendanceExcel(file: File, monthYear: string) {
  if (!/^\d{2}\/\d{4}$/.test(monthYear) || +monthYear.slice(0, 2) < 1 || +monthYear.slice(0, 2) > 12) throw new Error("Invalid calendar month.");
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Please select an .xlsx attendance file.");
  if (!file.size || file.size > 4 * 1024 * 1024) throw new Error("Excel file must be between 1 byte and 4 MB.");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const theme = (workbook.model as unknown as { themes?: Record<string, string> }).themes?.theme1 ?? "";
  const rows: AttendanceRow[] = [];
  const issues: AttendanceIssue[] = [];
  const seen = new Set<string>();
  let sheets = 0;
  for (const ws of workbook.worksheets) {
    if (ws.rowCount > 5000 || ws.columnCount > 200) throw new Error("Attendance sheet is too large (maximum 5000 rows and 200 columns).");
    let header = 0;
    let dates: Array<{ column: number; day: number }> = [];
    let codeColumn = 0;
    let nameColumn = 0;
    for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
      const candidate: typeof dates = [];
      ws.getRow(r).eachCell((cell, column) => {
        const date = headerDate(raw(cell), Boolean(workbook.properties.date1904));
        if (date) {
          const key = `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
          if (key === monthYear) candidate.push({ column, day: date.getUTCDate() });
        }
      });
      if (candidate.length < 20) continue;
      ws.getRow(r).eachCell((cell, column) => {
        const text = `${String(raw(cell) ?? "")} ${String(raw(ws.getRow(r + 1).getCell(column)) ?? "")}`.toLowerCase().replace(/[^a-z]/g, "");
        if (text.includes("employeename")) nameColumn = column;
        if (text.includes("employeecode") || text.includes("employeeid")) codeColumn = column;
      });
      if (codeColumn && nameColumn) { header = r; dates = candidate; break; }
    }
    if (!header) continue;
    const [month, year] = monthYear.split("/").map(Number);
    const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (dates.length !== dayCount || new Set(dates.map(d => d.day)).size !== dayCount) throw new Error(`${ws.name}: expected one date column for every day of ${monthYear}.`);
    sheets++;
    for (let r = header + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const name = String(raw(row.getCell(nameColumn)) ?? "").trim();
      const employeeCode = String(raw(row.getCell(codeColumn)) ?? "").trim();
      if (!name || (!employeeCode && name.toLowerCase() === "employee name")) continue;
      if (!employeeCode) { issues.push({ row: r, name, reason: "Employee code missing; row skipped." }); continue; }
      // Header continuation row is not an employee.
      if (/^code$/i.test(employeeCode)) continue;
      if (seen.has(employeeCode)) throw new Error(`Duplicate employee code ${employeeCode} in file. Resolve duplicate rows before importing.`);
      seen.add(employeeCode);
      const days: AttendanceDays = {};
      let invalid = "";
      for (const date of dates) {
        const status = String(raw(row.getCell(date.column)) ?? "").trim().toUpperCase();
        if (!status) continue; // Missing data is never inferred as absence.
        if (!["P", "A", "R", "H"].includes(status)) { invalid = `Unsupported status '${status}' on day ${date.day}; row skipped.`; break; }
        days[String(date.day)] = status === "P" && greyFill(row.getCell(date.column), theme) ? "SL" : status as AttendanceCode;
      }
      if (invalid || !Object.keys(days).length) { issues.push({ row: r, name, reason: invalid || "No attendance values; row skipped." }); continue; }
      rows.push({ row: r, name, employeeCode, days });
    }
  }
  if (!sheets) throw new Error(`No attendance sheet found for ${monthYear}. Open that file's month in the calendar, then upload. Expected Employee Name, Employee Code and full date headers.`);
  return { rows, issues };
}

export function matchAttendanceRows(
  rows: AttendanceRow[],
  employees: Array<{ id: string; employeeCode: string | null }>,
  issues: AttendanceIssue[]
) {
  const byCode = new Map(employees.filter(e => e.employeeCode).map(e => [e.employeeCode!.trim(), e]));
  const matched = [];
  for (const row of rows) {
    const employee = byCode.get(row.employeeCode);
    if (!employee) { issues.push({ row: row.row, name: row.name, reason: `Employee code ${row.employeeCode} not found; row skipped.` }); continue; }
    matched.push({ employeeId: employee.id, days: row.days });
  }
  return matched;
}
