import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { makeSchemeReport, SchemeSource } from "@/lib/schemeReport";
import { readSchemeSheets } from "@/lib/schemeSheets";
import { fail, ok } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN") return fail("Only Admin allowed.", 403);
    // Visibility grants control employees' own view, never Admin reporting.
    const employees = await prisma.employee.findMany({
      where: { role: "EMPLOYEE", deletedAt: null },
      select: { id: true, name: true, employeeCode: true, branch: true, department: true, status: true },
      orderBy: { name: "asc" }
    });
    const sources: SchemeSource[] = ["gold", "bonus"];
    const schemes = await Promise.all(sources.map(async source => {
      try {
        // All employees use one consistent source snapshot per scheme/request.
        const sheets = await readSchemeSheets(source);
        const reports = await Promise.all(employees.map(async employee => ({
          employee,
          report: await makeSchemeReport(source, employee.name, employee.branch || "", sheets)
        })));
        return { source, reports, error: "" };
      } catch (e) {
        return { source, reports: [], error: e instanceof Error ? e.message : "Unable to load scheme data." };
      }
    }));
    return ok({ employees, schemes });
  } catch (e) {
    return fail(e, 403);
  }
}
