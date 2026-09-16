import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { addAuditLog } from "@/lib/audit";
import { fail, ok } from "@/lib/utils";
import { addSystemNotification } from "@/lib/systemNotification";
import { sendPushToEmployees } from "@/lib/webPush";

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

function inclusiveDayCount(fromDate: Date, toDate: Date, fromDayType = "FULL", toDayType = "FULL") {
  const calendarDays = Math.floor((toDate.getTime() - fromDate.getTime()) / 86400000) + 1;
  if (calendarDays <= 1) return fromDayType === "HALF" ? 0.5 : 1;
  return calendarDays - (fromDayType === "HALF" ? 0.5 : 0) - (toDayType === "HALF" ? 0.5 : 0);
}

function monthlyLeaveBreakdown(fromDate: Date, toDate: Date, fromDayType = "FULL", toDayType = "FULL") {
  const start = Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), fromDate.getUTCDate());
  const end = Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate());
  const result = new Map<string, number>();

  for (let time = start; time <= end; time += 86400000) {
    const date = new Date(time);
    const isStart = time === start;
    const isEnd = time === end;
    let value = 1;
    if (start === end) value = fromDayType === "HALF" ? 0.5 : 1;
    else if ((isStart && fromDayType === "HALF") || (isEnd && toDayType === "HALF")) value = 0.5;
    const monthYear = `${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
    result.set(monthYear, Number(((result.get(monthYear) || 0) + value).toFixed(2)));
  }

  return Array.from(result, ([monthYear, leave]) => ({ monthYear, leave }));
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
    const fromDayType = String(body.fromDayType || "FULL").trim().toUpperCase();
    const requestedToDayType = String(body.toDayType || "FULL").trim().toUpperCase();
    if (!["FULL", "HALF"].includes(fromDayType) || !["FULL", "HALF"].includes(requestedToDayType)) throw new Error("Select a valid Full Day or Half Day option.");
    const toDayType = fromDate.getTime() === toDate.getTime() ? fromDayType : requestedToDayType;
    const reason = String(body.reason || "").trim();
    if (!reason) throw new Error("Leave reason is required.");
    if (fromDateText <= todayInIndia()) throw new Error("From date must be after today.");
    if (toDate < fromDate) throw new Error("To date cannot be before From date.");

    const leaveRequest = await prisma.leaveRequest.create({
      data: { requesterId: session.id, fromDate, toDate, fromDayType, toDayType, reason },
      include: includePeople
    });
    await addAuditLog({
      actorId: session.id,
      actorName: session.name,
      action: "CREATE_LEAVE_REQUEST",
      target: leaveRequest.id,
      details: { fromDate: body.fromDate, toDate: body.toDate, fromDayType, toDayType, days: inclusiveDayCount(fromDate, toDate, fromDayType, toDayType) }
    });
    await addSystemNotification({
      actorId: session.id,
      action: "NEW_LEAVE_REQUEST",
      title: "New Leave Request",
      text: `${session.name} requested ${inclusiveDayCount(fromDate, toDate, fromDayType, toDayType)} day(s) leave for ${formatDateRange(fromDate, toDate)}. Reason: ${reason}`,
      type: "NOTICE",
      url: "/?section=leaveRequests",
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
      const days = inclusiveDayCount(current.fromDate, current.toDate, current.fromDayType, current.toDayType);
      const monthlyBreakdown = status === "APPROVED"
        ? monthlyLeaveBreakdown(current.fromDate, current.toDate, current.fromDayType, current.toDayType)
        : [];

      for (const item of monthlyBreakdown) {
        const existing = await tx.leaveRecord.findUnique({
          where: { employeeId_monthYear: { employeeId: current.requesterId, monthYear: item.monthYear } }
        });
        const activeExisting = existing && !existing.deletedAt ? existing : null;
        const newLeave = Number(((activeExisting ? Number(activeExisting.leave) : 0) + item.leave).toFixed(2));
        const approvalReason = `Approved leave request: ${current.reason}`;

        if (existing) {
          await tx.leaveRecord.update({
            where: { id: existing.id },
            data: {
              leave: newLeave,
              reason: activeExisting?.reason || approvalReason,
              deletedAt: null,
              deletedById: null,
              deletedByName: null
            }
          });
        } else {
          await tx.leaveRecord.create({
            data: { employeeId: current.requesterId, monthYear: item.monthYear, leave: item.leave, reason: approvalReason }
          });
        }
      }

      const daysText = `${days} ${days === 1 ? "day" : "days"}`;
      const monthlyText = monthlyBreakdown.map(item => `${item.leave} day(s) in ${item.monthYear}`).join(", ");
      const text = status === "APPROVED"
        ? `Your leave request for ${dateRange} (${daysText}) has been approved. Leave added: ${monthlyText}.`
        : `Your leave request for ${dateRange} (${daysText}) has been rejected. Reason: ${rejectionReason}`;
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
      const request = await tx.leaveRequest.findUnique({ where: { id }, include: includePeople });
      return { request, monthlyBreakdown, notificationText: text, requesterId: current.requesterId };
    });

    await addAuditLog({
      actorId: session.id,
      actorName: session.name,
      action: `${status}_LEAVE_REQUEST`,
      target: id,
      details: status === "REJECTED" ? { rejectionReason } : { monthlyLeaveAdded: result.monthlyBreakdown }
    });
    await sendPushToEmployees([result.requesterId], {
      title: status === "APPROVED" ? "Leave Approved" : "Leave Rejected",
      body: result.notificationText,
      url: "/?section=leaveRequests",
      tag: `leave-${id}`,
    });
    return ok({ request: result.request, monthlyLeaveAdded: result.monthlyBreakdown });
  } catch (error) {
    return fail(error);
  }
}
