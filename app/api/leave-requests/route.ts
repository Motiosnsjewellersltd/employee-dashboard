import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { addAuditLog } from "@/lib/audit";
import { fail, ok } from "@/lib/utils";

function parseDateOnly(value: unknown) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error("Valid From and To dates are required.");
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) throw new Error("Valid From and To dates are required.");
  return date;
}

function formatDateRange(fromDate: Date, toDate: Date) {
  const format = (date: Date) => new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC"
  }).format(date);
  const from = format(fromDate);
  const to = format(toDate);
  return from === to ? from : `${from} to ${to}`;
}

function todayInIndia() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Kolkata"
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

const includePeople = {
  requester: { select: { id: true, name: true, mobile: true, designation: true, department: true } },
  decidedBy: { select: { id: true, name: true } }
};

export async function GET() {
  try {
    const session = await requireSession();
    const canReview = session.role === "ADMIN" || session.role === "HR";
    const requests = await prisma.leaveRequest.findMany({
      where: canReview ? undefined : { requesterId: session.id },
      include: includePeople,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 500
    });
    return ok({ requests });
  } catch (error) {
    return fail(error, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.role !== "EMPLOYEE") throw new Error("Only employees and designation-based managers can submit leave requests.");

    const body = await req.json();
    const fromDate = parseDateOnly(body.fromDate);
    const toDate = parseDateOnly(body.toDate);
    const fromDateText = String(body.fromDate || "").trim();
    const reason = String(body.reason || "").trim();
    if (!reason) throw new Error("Leave reason is required.");
    if (fromDateText <= todayInIndia()) throw new Error("From date must be after today.");
    if (toDate < fromDate) throw new Error("To date cannot be before From date.");

    const leaveRequest = await prisma.leaveRequest.create({
      data: { requesterId: session.id, fromDate, toDate, reason },
      include: includePeople
    });
    await addAuditLog({
      actorId: session.id,
      actorName: session.name,
      action: "CREATE_LEAVE_REQUEST",
      target: leaveRequest.id,
      details: { fromDate: body.fromDate, toDate: body.toDate }
    });
    return ok({ request: leaveRequest });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN" && session.role !== "HR") throw new Error("Only Admin/HR can approve or reject leave requests.");

    const body = await req.json();
    const id = String(body.id || "").trim();
    const status = String(body.status || "").trim().toUpperCase();
    const rejectionReason = String(body.rejectionReason || "").trim();
    if (!id) throw new Error("Leave request is required.");
    if (status !== "APPROVED" && status !== "REJECTED") throw new Error("Select Approve or Reject.");
    if (status === "REJECTED" && !rejectionReason) throw new Error("Rejection reason is required.");

    const result = await prisma.$transaction(async tx => {
      const current = await tx.leaveRequest.findUnique({ where: { id }, include: includePeople });
      if (!current) throw new Error("Leave request not found.");
      if (current.status !== "PENDING") throw new Error("This leave request has already been decided.");

      const claimed = await tx.leaveRequest.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: status as "APPROVED" | "REJECTED",
          rejectionReason: status === "REJECTED" ? rejectionReason : null,
          decidedById: session.id,
          decidedAt: new Date()
        }
      });
      if (claimed.count !== 1) throw new Error("This leave request has already been decided.");

      const dateRange = formatDateRange(current.fromDate, current.toDate);
      const text = status === "APPROVED"
        ? `Your leave request for ${dateRange} has been approved.`
        : `Your leave request for ${dateRange} has been rejected. Reason: ${rejectionReason}`;
      await tx.notificationBlast.create({
        data: {
          type: "INFORMATION",
          text,
          filterType: "SYSTEM",
          filterValue: `LEAVE_${status}`,
          createdById: session.id,
          recipients: { create: [{ employeeId: current.requesterId }] }
        }
      });
      return tx.leaveRequest.findUnique({ where: { id }, include: includePeople });
    });

    await addAuditLog({
      actorId: session.id,
      actorName: session.name,
      action: `${status}_LEAVE_REQUEST`,
      target: id,
      details: status === "REJECTED" ? { rejectionReason } : undefined
    });
    return ok({ request: result });
  } catch (error) {
    return fail(error);
  }
}
