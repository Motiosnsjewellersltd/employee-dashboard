import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewAttendanceCalendar } from "@/lib/attendanceCalendarAccess";
import { punchMonthRange } from "@/lib/biometricPunch";

export const runtime = "nodejs";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(req: NextRequest) {
  let session;
  try { session = await requireSession(); }
  catch { return reply({ ok: false, error: "Unauthorized" }, 401); }
  if (session.role !== "ADMIN" && session.role !== "HR") return reply({ ok: false, error: "Only Admin/HR allowed." }, 403);
  const employeeId = req.nextUrl.searchParams.get("employeeId") || "";
  const monthYear = req.nextUrl.searchParams.get("monthYear") || "";
  if (!canViewAttendanceCalendar(session, { id: employeeId }, monthYear)) return reply({ ok: false, error: "Access denied." }, 403);
  let range;
  try { range = punchMonthRange(monthYear); }
  catch { return reply({ ok: false, error: "Invalid month." }, 400); }
  try {
    const employee = await prisma.employee.findFirst({ where: { id: employeeId, deletedAt: null }, select: { id: true } });
    if (!employee) return reply({ ok: false, error: "Employee not found." }, 404);
    // A single employee/month is bounded; never silently truncate punch history.
    const punches = await prisma.biometricPunch.findMany({
      where: { employeeId, punchedAt: { gte: range.start, lt: range.end, lte: new Date() } },
      orderBy: [{ punchedAt: "asc" }, { id: "asc" }],
      select: { id: true, punchedAt: true, direction: true }
    });
    return reply({ ok: true, data: { punches } });
  } catch (e) {
    const missingTable = e && typeof e === "object" && "code" in e && e.code === "P2021";
    // Initial deployment may precede additive SQL setup; existing calendar works.
    if (missingTable) return reply({ ok: true, data: { punches: [], configured: false } });
    return reply({ ok: false, error: "Could not load punch times." }, 503);
  }
}
