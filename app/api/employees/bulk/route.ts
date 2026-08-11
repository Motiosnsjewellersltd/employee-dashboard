import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/utils";
import { addAuditLog } from "@/lib/audit";
import { addSystemNotification } from "@/lib/systemNotification";

function roleGuard(role: string) {
  if (!["ADMIN", "HR"].includes(role)) throw new Error("Only Admin/HR allowed.");
}

function cleanIds(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return Array.from(new Set(value.map(String).map(v => v.trim()).filter(Boolean)));
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    roleGuard(session.role);
    const body = await req.json();
    const ids = cleanIds(body.ids);
    const action = String(body.action || "").trim();
    if (!ids.length) throw new Error("Select at least one employee.");

    const eligible = await prisma.employee.findMany({
      where: {
        id: { in: ids, not: session.id },
        role: { not: "ADMIN" },
        deletedAt: null
      },
      select: { id: true, name: true }
    });
    const eligibleIds = eligible.map(e => e.id);
    if (!eligibleIds.length) throw new Error("No eligible employees selected.");

    let affected = 0;
    let auditAction = "";
    let notificationText = "";

    if (action === "ACTIVATE" || action === "DEACTIVATE") {
      const status = action === "ACTIVATE" ? "ACTIVE" : "INACTIVE";
      const result = await prisma.employee.updateMany({ where: { id: { in: eligibleIds } }, data: { status } });
      affected = result.count;
      auditAction = action === "ACTIVATE" ? "BULK_ACTIVATE_EMPLOYEES" : "BULK_DEACTIVATE_EMPLOYEES";
      notificationText = `${affected} employee${affected === 1 ? "" : "s"} ${status === "ACTIVE" ? "activated" : "deactivated"} in bulk by ${session.name}.`;
    } else if (action === "CHANGE_DEPARTMENT") {
      const department = String(body.department || "").trim();
      if (!department) throw new Error("Department is required.");
      const result = await prisma.employee.updateMany({ where: { id: { in: eligibleIds } }, data: { department } });
      affected = result.count;
      auditAction = "BULK_CHANGE_DEPARTMENT";
      notificationText = `${affected} employee${affected === 1 ? "" : "s"} moved to ${department} by ${session.name}.`;
    } else if (action === "DELETE") {
      const result = await prisma.employee.updateMany({ where: { id: { in: eligibleIds }, deletedAt: null }, data: { deletedAt: new Date(), deletedById: session.id, deletedByName: session.name } });
      affected = result.count;
      auditAction = "BULK_DELETE_EMPLOYEES";
      notificationText = `${affected} employee${affected === 1 ? "" : "s"} moved to Recycle Bin in bulk by ${session.name}.`;
    } else {
      throw new Error("Invalid bulk action.");
    }

    await addAuditLog({
      actorId: session.id,
      actorName: session.name,
      action: auditAction,
      target: `${affected} employees`,
      details: { selected: ids.length, affected, skipped: ids.length - eligibleIds.length, names: eligible.map(e => e.name) }
    });
    await addSystemNotification({
      actorId: session.id,
      action: auditAction,
      text: notificationText,
      type: action === "DELETE" || action === "DEACTIVATE" ? "NOTICE" : "INFORMATION"
    });

    return ok({ affected, skipped: ids.length - eligibleIds.length });
  } catch (e) {
    return fail(e);
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    roleGuard(session.role);
    const url = new URL(req.url);
    const ids = Array.from(new Set(String(url.searchParams.get("ids") || "").split(",").map(v => v.trim()).filter(Boolean)));
    if (!ids.length) throw new Error("Select at least one employee.");

    const employees = await prisma.employee.findMany({
      where: { id: { in: ids }, role: { not: "ADMIN" }, deletedAt: null },
      orderBy: { name: "asc" }
    });

    const lines = [
      ["Name", "Mobile", "DOB", "Designation", "Department", "DOJ", "Role", "Status"].map(csvCell).join(","),
      ...employees.map(e => [
        e.name,
        e.mobile,
        e.dob ? e.dob.toLocaleDateString("en-GB") : "",
        e.designation || "",
        e.department || "",
        e.doj ? e.doj.toLocaleDateString("en-GB") : "",
        e.role,
        e.status
      ].map(csvCell).join(","))
    ];

    await addAuditLog({
      actorId: session.id,
      actorName: session.name,
      action: "BULK_EXPORT_EMPLOYEES",
      target: `${employees.length} employees`,
      details: { selected: ids.length, exported: employees.length }
    });

    return new Response(`\uFEFF${lines.join("\r\n")}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="selected-employees-${new Date().toISOString().slice(0, 10)}.csv"`
      }
    });
  } catch (e) {
    return fail(e);
  }
}
