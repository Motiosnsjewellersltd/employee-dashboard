import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fail, formatDate, ok } from "@/lib/utils";

export async function GET(_: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    if (session.role === "EMPLOYEE" && session.id !== id) throw new Error("Unauthorized");

    const employee = await prisma.employee.findFirst({ where: { id, deletedAt: null } });
    if (!employee) throw new Error("Employee not found.");

    const previous = await (prisma as any).employmentHistory.findMany({
      where: { employeeId: id },
      orderBy: [{ joiningDate: "asc" }, { recordedAt: "asc" }]
    });

    const history = [
      ...previous.map((row: any, index: number) => ({
        id: row.id,
        cycle: index + 1,
        joiningDate: formatDate(row.joiningDate),
        exitDate: formatDate(row.exitDate),
        designation: row.designation || "",
        department: row.department || "",
        branch: row.branch || "",
        current: false
      })),
      {
        id: `current-${employee.id}`,
        cycle: previous.length + 1,
        joiningDate: formatDate(employee.doj),
        exitDate: formatDate(employee.exitDate),
        designation: employee.designation || "",
        department: employee.department || "",
        branch: employee.branch || "",
        current: !employee.exitDate && employee.status === "ACTIVE"
      }
    ];

    return ok({ history });
  } catch (e) {
    return fail(e, 401);
  }
}
