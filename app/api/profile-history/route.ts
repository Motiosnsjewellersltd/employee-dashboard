import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { safeHistoryChanges } from "@/lib/employeeProfileHistory";

export const runtime = "nodejs";
export async function GET(req: Request) {
  try {
    const session = await requireSession();
    if (session.role !== "EMPLOYEE") return Response.json({ ok: false, error: "Employee profile only." }, { status: 403 });
    const params = new URL(req.url).searchParams;
    if (params.has("employeeId") && params.get("employeeId") !== session.id) return Response.json({ ok: false, error: "Access denied." }, { status: 403 });
    const filter = params.get("filter") || "all", page = Number(params.get("page") || 1);
    if (!["all", "profile", "reports"].includes(filter) || !Number.isSafeInteger(page) || page < 1 || page > 10000)
      return Response.json({ ok: false, error: "Invalid history filter/page." }, { status: 400 });
    const employee = await prisma.employee.findFirst({ where: { id: session.id, deletedAt: null }, select: { reportingRequired: true } });
    if (!employee) return Response.json({ ok: false, error: "Employee not found." }, { status: 404 });
    const reports = employee.reportingRequired && filter !== "profile" ? await prisma.employeeReport.findMany({
      where: { employeeId: session.id }, select: { id: true, title: true }
    }) : [];
    const reportById = new Map(reports.map(report => [report.id, report]));
    const clauses = [
      ...(filter !== "reports" ? [{ action: "EMPLOYEE_PROFILE_CHANGE", target: session.id }] : []),
      ...(reports.length ? [{ action: { in: ["UPLOAD_EMPLOYEE_REPORT", "UPDATE_EMPLOYEE_REPORT"] }, target: { in: reports.map(report => report.id) } }] : [])
    ];
    const logs = clauses.length ? await prisma.activityLog.findMany({ where: { OR: clauses }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * 30, take: 31, select: { id: true, action: true, target: true, details: true, actorName: true, createdAt: true } }) : [];
    const items = logs.slice(0, 30).map(log => {
      let details: unknown = null;
      try { details = JSON.parse(log.details || "null"); } catch { /* Legacy malformed log. */ }
      if (log.action === "EMPLOYEE_PROFILE_CHANGE") return { id: log.id, kind: "profile", createdAt: log.createdAt, actorName: log.actorName,
        changes: safeHistoryChanges(details) };
      const report = reportById.get(log.target || "");
      return { id: log.id, kind: "report", createdAt: log.createdAt, actorName: log.actorName,
        title: log.action === "UPDATE_EMPLOYEE_REPORT" ? "Report updated" : "Report uploaded", report: report ? { id: report.id, title: report.title } : null };
    });
    return Response.json({ ok: true, data: { items, page, hasMore: logs.length > 30 } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return Response.json({ ok: false, error: "Could not load your history. Please sign in or retry." }, { status: 401 }); }
}
