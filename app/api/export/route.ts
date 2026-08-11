import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/utils";

function csvCell(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function csv(rows: any[], headers: string[], mapper: (row: any) => unknown[]) {
  return [headers.map(csvCell).join(","), ...rows.map(r => mapper(r).map(csvCell).join(","))].join("\n");
}

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (!["ADMIN", "HR"].includes(session.role)) return NextResponse.json({ ok: false, error: "Only Admin/HR allowed." }, { status: 401 });

  const type = new URL(req.url).searchParams.get("type") || "employees";
  let body = "";
  let file = `${type}.csv`;

  if (type === "employees") {
    const rows = await prisma.employee.findMany({ where: { role: { not: "ADMIN" }, deletedAt: null }, orderBy: { name: "asc" } });
    body = csv(rows, ["ID", "Name", "Mobile", "Role", "Designation", "Department", "DOB", "DOJ", "ExitDate", "Status"], r => [r.id, r.name, r.mobile, r.role, r.designation, r.department, formatDate(r.dob), formatDate(r.doj), formatDate(r.exitDate), r.status]);
  } else if (type === "leaves") {
    const rows = await prisma.leaveRecord.findMany({ where: { deletedAt: null, employee: { deletedAt: null } }, include: { employee: true }, orderBy: [{ monthYear: "asc" }, { employee: { name: "asc" } }] });
    body = csv(rows, ["EmployeeID", "Employee Name", "Mobile", "Month/Year", "Leave", "Reason / Remark"], r => [r.employeeId, r.employee.name, r.employee.mobile, r.monthYear, r.leave, r.reason || ""]);
  } else if (type === "notifications") {
    const rows = await prisma.notificationBlast.findMany({ include: { recipients: { include: { employee: true } }, createdBy: true }, orderBy: { createdAt: "desc" } });
    body = csv(rows, ["Type", "Text", "Attachment", "Created By", "Created At", "Recipients"], r => [r.type, r.text, r.attachmentName || "", r.createdBy.name, r.createdAt.toISOString(), r.recipients.map((x: any) => x.employee.name).join("; ")]);
  } else if (type === "chats") {
    const rows = await prisma.chatMessage.findMany({ include: { sender: true }, orderBy: { createdAt: "desc" }, take: 10000 });
    body = csv(rows, ["ThreadID", "Sender", "Message", "Attachment", "Created At", "Edited"], r => [r.threadId, r.sender.name, r.text, r.attachmentName || "", r.createdAt.toISOString(), r.isEdited ? "Yes" : "No"]);
  } else {
    body = "Invalid export type";
    file = "invalid.csv";
  }

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file}"`
    }
  });
}
