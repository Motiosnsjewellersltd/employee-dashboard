import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { addAuditLog } from "@/lib/audit";
import { fail, ok } from "@/lib/utils";
import { addSystemNotification } from "@/lib/systemNotification";
import { sendPushToEmployees } from "@/lib/webPush";
import { requireHrPermission } from "@/lib/permissions";
import { findManagersForEmployee, getManagerRecord, getManagerTeamEmployeeIds } from "@/lib/teamScope";

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
  requester: { select: { id: true, name: true, mobile: true, designation: true, department: true, branch: true, floor: true } },
  decidedBy: { select: { id: true, name: true } },
  managerDecidedBy: { select: { id: true, name: true } }
};

export async function GET() {
  try {
    const session = await requireSession();
    const canReview = session.role === "ADMIN" || session.role === "HR";
    let where: any = { requesterId: session.id };

    if (canReview) {
      where = undefined;
    } else if (session.role === "EMPLOYEE" && session.isFloorManager) {
      const manager = await getManagerRecord(session.id);
      const teamIds = await getManagerTeamEmployeeIds(manager);
      where = { OR: [{ requesterId: session.id }, { requesterId: { in: teamIds } }] };
    }

    const requests = await prisma.leaveRequest.findMany({
      where,
      include: includePeople,
      orderBy: [{ status: "asc" }, { managerStatus: "asc" }, { createdAt: "desc" }],
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

    const requester = await prisma.employee.findFirst({
      where: { id: session.id, deletedAt: null },
      select: { id: true, branch: true, floor: true, department: true }
    });
    if (!requester) throw new Error("Employee not found.");

    const managers = await findManagersForEmployee(requester);
    const managerStatus = managers.length ? "PENDING" : "APPROVED";

    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        requesterId: session.id,
        fromDate,
        toDate,
        fromDayType,
        toDayType,
        reason,
        managerStatus,
        managerDecidedAt: managers.length ? null : new Date()
      },
      include: includePeople
    });

    await addAuditLog({
      actorId: session.id,
      actorName: session.name,
      action: "CREATE_LEAVE_REQUEST",
      target: leaveRequest.id,
      details: {
        fromDate: body.fromDate,
        toDate: body.toDate,
        fromDayType,
        toDayType,
        days: inclusiveDayCount(fromDate, toDate, fromDayType, toDayType),
        managerApprovalRequired: managers.length > 0
      }
    });

    if (managers.length) {
      const managerIds = managers.map(manager => manager.id);
      const managerText = `${session.name} requested ${inclusiveDayCount(fromDate, toDate, fromDayType, toDayType)} day(s) leave for ${formatDateRange(fromDate, toDate)}. Manager approval is required.`;
      await prisma.notificationBlast.create({
        data: {
          type: "NOTICE",
          text: managerText,
          filterType: "SYSTEM",
          filterValue: "NEW_LEAVE_REQUEST_MANAGER",
          createdById: session.id,
          recipients: { create: managerIds.map(employeeId => ({ employeeId })) }
        }
      });
      await sendPushToEmployees(managerIds, {
        title: "Leave Approval Required",
        body: managerText,
        url: "/?section=leaveRequests",
        tag: `leave-manager-${leaveRequest.id}`
      });
    }

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
    const body = await req.json();
    const id = String(body.id || "").trim();
    const status = String(body.status || "").trim().toUpperCase();
    const rejectionReason = String(body.rejectionReason || "").trim();

    if (!id) throw new Error("Leave request is required.");
    if (status !== "APPROVED" && status !== "REJECTED") throw new Error("Select Approve or Reject.");
    if (status === "REJECTED" && !rejectionReason) throw new Error("Rejection reason is required.");

    const isHrReviewer = session.role === "ADMIN" || session.role === "HR";
    const isManagerReviewer = session.role === "EMPLOYEE" && Boolean(session.isFloorManager);

    if (!isHrReviewer && !isManagerReviewer) {
      throw new Error("You are not allowed to approve or reject leave requests.");
    }

    if (isHrReviewer) {
      await requireHrPermission(session.role, "hrCanReviewLeaveRequests", "HR is not allowed to approve or reject leave requests.");
    }

    const result = await prisma.$transaction(async tx => {
      const current = await tx.leaveRequest.findUnique({ where: { id }, include: includePeople });
      if (!current) throw new Error("Leave request not found.");
      if (current.status !== "PENDING") throw new Error("This leave request has already been decided.");

      if (isManagerReviewer) {
        const manager = await getManagerRecord(session.id);
        const teamIds = await getManagerTeamEmployeeIds(manager);
        if (!teamIds.includes(current.requesterId)) throw new Error("This employee is not in your team.");
        if (current.managerStatus !== "PENDING") throw new Error("Manager decision has already been completed.");

        await tx.leaveRequest.update({
          where: { id },
          data: {
            managerStatus: status,
            managerRejectionReason: status === "REJECTED" ? rejectionReason : null,
            managerDecidedById: session.id,
            managerDecidedAt: new Date(),
            ...(status === "REJECTED" ? {
              status: "REJECTED" as const,
              rejectionReason,
              decidedById: session.id,
              decidedAt: new Date()
            } : {})
          }
        });

        const dateRange = formatDateRange(current.fromDate, current.toDate);
        const days = inclusiveDayCount(current.fromDate, current.toDate, current.fromDayType, current.toDayType);
        const text = status === "APPROVED"
          ? `Your manager approved your leave request for ${dateRange} (${days} day(s)). It is now pending HR approval.`
          : `Your leave request for ${dateRange} (${days} day(s)) was rejected by your manager. Reason: ${rejectionReason}`;

        await tx.notificationBlast.create({
          data: {
            type: "INFORMATION",
            text,
            filterType: "SYSTEM",
            filterValue: `LEAVE_MANAGER_${status}`,
            createdById: session.id,
            recipients: { create: [{ employeeId: current.requesterId }] }
          }
        });

        if (status === "APPROVED") {
          const hrUsers = await tx.employee.findMany({
            where: { status: "ACTIVE", deletedAt: null, role: { in: ["ADMIN", "HR"] } },
            select: { id: true }
          });
          if (hrUsers.length) {
            await tx.notificationBlast.create({
              data: {
                type: "NOTICE",
                text: `${current.requester.name}'s leave request for ${dateRange} has been approved by manager ${session.name} and is ready for HR action.`,
                filterType: "SYSTEM",
                filterValue: "LEAVE_MANAGER_APPROVED",
                createdById: session.id,
                recipients: { create: hrUsers.map(user => ({ employeeId: user.id })) }
              }
            });
          }
        }

        const request = await tx.leaveRequest.findUnique({ where: { id }, include: includePeople });
        return {
          request,
          monthlyBreakdown: [] as { monthYear: string; leave: number }[],
          notificationText: text,
          requesterId: current.requesterId,
          managerStage: true
        };
      }

      if (current.managerStatus !== "APPROVED") {
        throw new Error("Manager approval is required before HR can take action.");
      }

      const claimed = await tx.leaveRequest.updateMany({
        where: { id, status: "PENDING", managerStatus: "APPROVED" },
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
        ? `Your leave request for ${dateRange} (${daysText}) has been approved by HR. Leave added: ${monthlyText}.`
        : `Your leave request for ${dateRange} (${daysText}) has been rejected by HR. Reason: ${rejectionReason}`;

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
      return { request, monthlyBreakdown, notificationText: text, requesterId: current.requesterId, managerStage: false };
    });

    await addAuditLog({
      actorId: session.id,
      actorName: session.name,
      action: result.managerStage ? `MANAGER_${status}_LEAVE_REQUEST` : `${status}_LEAVE_REQUEST`,
      target: id,
      details: status === "REJECTED" ? { rejectionReason } : { monthlyLeaveAdded: result.monthlyBreakdown }
    });

    await sendPushToEmployees([result.requesterId], {
      title: result.managerStage
        ? (status === "APPROVED" ? "Manager Approved Leave" : "Manager Rejected Leave")
        : (status === "APPROVED" ? "Leave Approved" : "Leave Rejected"),
      body: result.notificationText,
      url: "/?section=leaveRequests",
      tag: `leave-${id}`,
    });

    return ok({
      request: result.request,
      monthlyLeaveAdded: result.monthlyBreakdown,
      stage: result.managerStage ? "MANAGER" : "HR"
    });
  } catch (error) {
    return fail(error);
  }
}
