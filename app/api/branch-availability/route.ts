import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireHrPermission } from "@/lib/permissions";
import { availabilityDate, availabilityScopeMatches, buildBranchAvailability } from "@/lib/branchAvailability";
import { fail, ok } from "@/lib/utils";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN" && session.role !== "HR") return fail("Only Admin/HR allowed.", 403);
    await requireHrPermission(session.role, "hrMenuEmployees", "HR is not allowed to view employee availability.");
    const dateKey = req.nextUrl.searchParams.get("date") || "";
    const date = availabilityDate(dateKey);
    const branch = (req.nextUrl.searchParams.get("branch") || "").trim().toUpperCase();
    if (!["MT", "JB", "VN", "FACTORY"].includes(branch)) throw new Error("Select MT, JB, VN or Factory.");
    const employees = (await prisma.employee.findMany({
      where: { deletedAt: null, status: "ACTIVE", role: { not: "ADMIN" }, ...(branch === "FACTORY" ? {} : { branch }) },
      select: { id: true, name: true, employeeCode: true, department: true, designation: true, branch: true, status: true, doj: true, exitDate: true }
    })).filter(employee => availabilityScopeMatches(employee, branch));
    const ids = employees.map(employee => employee.id);
    const monthYear = `${dateKey.slice(5, 7)}/${dateKey.slice(0, 4)}`;
    const [leaves, records] = ids.length ? await prisma.$transaction([
      prisma.leaveRequest.findMany({
        where: { requesterId: { in: ids }, status: { in: ["PENDING", "APPROVED"] }, fromDate: { lte: date }, toDate: { gte: date } },
        select: { requesterId: true, fromDate: true, toDate: true, fromDayType: true, toDayType: true, status: true, managerStatus: true }
      }),
      prisma.monthlyAttendance.findMany({ where: { employeeId: { in: ids }, monthYear }, select: { employeeId: true, days: true } })
    ]) : [[], []];
    // Read-only: no employee notifications or changes to attendance/leaves.
    return ok(buildBranchAvailability(employees, leaves, records, dateKey, branch));
  } catch (e) { return fail(e); }
}
