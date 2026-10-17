import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireHrPermission } from "@/lib/permissions";
import { fail, ok } from "@/lib/utils";
import { matchAttendanceRows, parseAttendanceExcel } from "@/lib/attendanceImport";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!["ADMIN", "HR"].includes(session.role)) return fail("Only Admin/HR allowed.", 403);
    const employeeId = req.nextUrl.searchParams.get("employeeId") || "";
    const monthYear = req.nextUrl.searchParams.get("monthYear") || "";
    if (!/^(0[1-9]|1[0-2])\/\d{4}$/.test(monthYear)) throw new Error("Invalid month.");
    const employee = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { id: true } });
    if (!employee) return fail("Employee not found.", 404);
    const record = await prisma.monthlyAttendance.findUnique({ where: { employeeId_monthYear: { employeeId, monthYear } } });
    let canUpload = session.role === "ADMIN";
    if (!canUpload) {
      try { await requireHrPermission(session.role, "hrCanUploadLeaves"); canUpload = true; } catch { /* Keep read access. */ }
    }
    return ok({ days: record?.days ?? {}, sourceName: record?.sourceName ?? "", canUpload });
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
    if (action !== "preview" && action !== "import") throw new Error("Invalid upload action.");
    if (!(file instanceof File)) throw new Error("Attendance Excel file required.");
    const parsed = await parseAttendanceExcel(file, monthYear);
    const employees = await prisma.employee.findMany({ where: { deletedAt: null, role: { not: "ADMIN" } }, select: { id: true, employeeCode: true } });
    const matched = matchAttendanceRows(parsed.rows, employees, parsed.issues);
    if (!matched.length) throw new Error("No valid employee codes matched. Check employee codes and attendance values.");
    if (action === "import") {
      // One atomic import; only matched employees in the selected month change.
      // Separate storage: leave totals, employee profiles and notifications are untouched.
      await prisma.$transaction(matched.map(row => prisma.monthlyAttendance.upsert({
        where: { employeeId_monthYear: { employeeId: row.employeeId, monthYear } },
        create: { ...row, monthYear, sourceName: file.name.slice(0, 255) },
        update: { days: row.days, sourceName: file.name.slice(0, 255) }
      })));
    }
    return ok({ matched: matched.length, skipped: parsed.issues.length, issues: parsed.issues, saved: action === "import" });
  } catch (e) { return fail(e); }
}
