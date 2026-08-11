import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fail, ok, saveUpload } from "@/lib/utils";
import { addAuditLog } from "@/lib/audit";

function dateFilter(from: string, to: string) {
  if (!from && !to) return undefined;
  const createdAt: any = {};
  if (from) createdAt.gte = new Date(`${from}T00:00:00`);
  if (to) createdAt.lte = new Date(`${to}T23:59:59`);
  return createdAt;
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const url = new URL(req.url);
    const search = String(url.searchParams.get("search") || "").trim();
    const type = String(url.searchParams.get("type") || "").trim();
    const designation = String(url.searchParams.get("designation") || "").trim();
    const department = String(url.searchParams.get("department") || "").trim();
    const from = String(url.searchParams.get("from") || "").trim();
    const to = String(url.searchParams.get("to") || "").trim();
    const view = String(url.searchParams.get("view") || "").trim();

    if (view === "center") {
      const where: any = {
        recipients: { some: { employeeId: session.id, clearedAt: null } }
      };
      if (type && type !== "All") where.type = type;
      if (search) where.text = { contains: search };
      const createdAt = dateFilter(from, to);
      if (createdAt) where.createdAt = createdAt;

      const rows = await prisma.notificationBlast.findMany({
        where,
        include: {
          recipients: { where: { employeeId: session.id } },
          createdBy: true
        },
        orderBy: { createdAt: "desc" },
        take: 300
      });

      const notifications = rows.map(r => ({
        id: r.id,
        type: r.type,
        text: r.text,
        attachmentUrl: r.attachmentUrl,
        attachmentName: r.attachmentName,
        filterType: r.filterType,
        filterValue: r.filterValue,
        createdAt: r.createdAt,
        createdBy: r.createdBy.name,
        readAt: r.recipients[0]?.readAt || null
      }));

      return ok({ notifications, unread: notifications.filter(n => !n.readAt).length });
    }

    const where: any = {};
    if (session.role === "EMPLOYEE") where.recipients = { some: { employeeId: session.id } };
    if (type && type !== "All") where.type = type;
    if (search) where.text = { contains: search };
    const createdAt = dateFilter(from, to);
    if (createdAt) where.createdAt = createdAt;
    if (designation && designation !== "All") where.recipients = { some: { employee: { designation } } };
    if (department && department !== "All") where.recipients = { some: { employee: { department } } };
    if (designation && designation !== "All" && department && department !== "All") where.recipients = { some: { employee: { designation, department } } };

    if (session.role === "EMPLOYEE") {
      await prisma.messageRecipient.updateMany({ where: { employeeId: session.id, readAt: null }, data: { readAt: new Date() } });
    }

    const rows = await prisma.notificationBlast.findMany({
      where,
      include: { recipients: { include: { employee: true } }, createdBy: true },
      orderBy: { createdAt: "desc" },
      take: 300
    });

    return ok({ notifications: rows.map(r => ({
      id: r.id,
      type: r.type,
      text: r.text,
      attachmentUrl: r.attachmentUrl,
      attachmentName: r.attachmentName,
      filterType: r.filterType,
      filterValue: r.filterValue,
      createdAt: r.createdAt,
      createdBy: r.createdBy.name,
      recipients: r.recipients.map(x => ({ id: x.employeeId, name: x.employee.name, designation: x.employee.designation, department: x.employee.department, readAt: x.readAt }))
    })) });
  } catch (e) { return fail(e, 401); }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!["ADMIN", "HR"].includes(session.role)) throw new Error("Only Admin/HR allowed.");
    const form = await req.formData();
    const type = String(form.get("type") || "INFORMATION").toUpperCase() as any;
    const text = String(form.get("text") || "").trim();
    const ids = String(form.get("employeeIds") || "").split(",").filter(Boolean);
    const file = form.get("attachment") as File | null;
    if (!text) throw new Error("Message text required.");
    if (!ids.length) throw new Error("Select employees.");
    let attachmentUrl = "";
    let attachmentName = "";
    if (file && file.size) {
      attachmentUrl = await saveUpload(file, "chat");
      attachmentName = file.name;
    }
    const blast = await prisma.notificationBlast.create({
      data: {
        type,
        text,
        attachmentUrl: attachmentUrl || null,
        attachmentName: attachmentName || null,
        createdById: session.id,
        recipients: { create: ids.map(employeeId => ({ employeeId })) }
      }
    });
    await addAuditLog({ actorId: session.id, actorName: session.name, action: "CREATE_NOTIFICATION", target: type, details: { sent: ids.length, hasAttachment: Boolean(attachmentUrl) } });
    return ok({ id: blast.id, sent: ids.length });
  } catch (e) { return fail(e); }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const id = String(body.id || "").trim();
    const now = new Date();

    if (id) {
      await (prisma as any).messageRecipient.updateMany({
        where: { employeeId: session.id, blastId: id, clearedAt: null, readAt: null },
        data: { readAt: now }
      });
    } else {
      await (prisma as any).messageRecipient.updateMany({
        where: { employeeId: session.id, clearedAt: null, readAt: null },
        data: { readAt: now }
      });
    }

    return ok();
  } catch (e) { return fail(e); }
}

export async function DELETE() {
  try {
    const session = await requireSession();
    await (prisma as any).messageRecipient.updateMany({
      where: { employeeId: session.id, clearedAt: null },
      data: { clearedAt: new Date(), readAt: new Date() }
    });
    return ok();
  } catch (e) { return fail(e); }
}
