import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireHrPermission } from "@/lib/permissions";
import { fail, ok } from "@/lib/utils";
import { matchAttendanceRows, parseAttendanceExcel, unmatchedAttendanceExcel } from "@/lib/attendanceImport";
import { canViewAttendanceCalendar, isAttendanceMonthAvailable } from "@/lib/attendanceCalendarAccess";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const employeeId = req.nextUrl.searchParams.get("employeeId") || "";
    if (!["ADMIN", "HR"].includes(session.role) && (session.role !== "EMPLOYEE" || session.id !== employeeId)) {
      return fail("Attendance calendar access is not enabled for this employee.", 403);
    }
    const monthYear = req.nextUrl.searchParams.get("monthYear") || "";
    if (!/^(0[1-9]|1[0-2])\/\d{4}$/.test(monthYear)) throw new Error("Invalid month.");
    if (!isAttendanceMonthAvailable(monthYear)) return fail("Attendance calendar is available from April 2026 onwards.", 403);
    const employee = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { id: true, employeeCode: true } });
    if (!employee) return fail("Employee not found.", 404);
    if (!canViewAttendanceCalendar(session, employee)) return fail("Attendance calendar access is not enabled for this employee.", 403);
    const record = await prisma.monthlyAttendance.findUnique({ where: { employeeId_monthYear: { employeeId, monthYear } } });
    let canUpload = session.role === "ADMIN";
    if (session.role === "HR") {
      try { await requireHrPermission(session.role, "hrCanUploadLeaves"); canUpload = true; } catch { /* Keep read access. */ }
    }
    return ok({ days: record?.days ?? {}, sourceName: record?.sourceName ?? "", canUpload, canViewPunchTimes: session.role === "ADMIN" || session.role === "HR" });
  } catch (e) { return fail(e); }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!["ADMIN", "HR"].includes(session.role)) return fail("Only Admin/HR allowed.", 403);
    await requireHrPermission(session.role, "hrCanUploadLeaves", "HR is not allowed to upload attendance.");
    const form = await req.formData();
    const file = form.get("file");
    const monthYear = String(form.get("monthYear") || "");
    const action = String(form.get("action") || "");
    if (action !== "preview" && action !== "import" && action !== "unmatched") throw new Error("Invalid upload action.");
    if (!(file instanceof File)) throw new Error("Attendance Excel file required.");
    const parsed = await parseAttendanceExcel(file, monthYear);
    const employees = await prisma.employee.findMany({ where: { deletedAt: null, role: { not: "ADMIN" } }, select: { id: true, employeeCode: true, name: true } });
    const matched = matchAttendanceRows(parsed.rows, employees, parsed.issues);
    parsed.issues.sort((a, b) => a.sheet.localeCompare(b.sheet) || a.row - b.row);
    if (action === "unmatched") {
      if (!parsed.issues.length) throw new Error("No unmatched/skipped rows to download.");
      const bytes = await unmatchedAttendanceExcel(file, monthYear, parsed.issues);
      return new NextResponse(new Uint8Array(bytes), { headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Attendance_Unmatched_${monthYear.replace("/", "-")}.xlsx"`,
        "Cache-Control": "no-store"
      } });
    }
    if (action === "import" && matched.length) {
      // One atomic import; only matched employees in the selected month change.
      // Separate storage: leave totals, employee profiles and notifications are untouched.
      await prisma.$transaction(matched.map(row => prisma.monthlyAttendance.upsert({
        where: { employeeId_monthYear: { employeeId: row.employeeId, monthYear } },
        create: { ...row, monthYear, sourceName: file.name.slice(0, 255) },
        update: { days: row.days, sourceName: file.name.slice(0, 255) }
      })));
    }
    return ok({ matched: matched.length, skipped: parsed.issues.length, issues: parsed.issues, saved: action === "import" && matched.length > 0 });
  } catch (e) { return fail(e); }
}
