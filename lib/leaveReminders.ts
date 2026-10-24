import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findManagersForEmployee } from "@/lib/teamScope";
import { sendPushToEmployees } from "@/lib/webPush";
import { dueLeaveReminders, leaveReminderAction, leaveRequestTarget } from "@/lib/leaveReminderRules";

const people = { requester: { select: { id: true, name: true, branch: true, floor: true, department: true, isFloorManager: true, status: true, deletedAt: true, exitDate: true } } } as const;
function range(from: Date, to: Date) {
  const format = (date: Date) => new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(date);
  return from.getTime() === to.getTime() ? format(from) : `${format(from)} to ${format(to)}`;
}
export async function runLeaveReminders({ now = new Date(), cursor = "" }: { now?: Date; cursor?: string } = {}) {
  const rows = await prisma.leaveRequest.findMany({
    where: { status: "PENDING", requester: { status: "ACTIVE", deletedAt: null, exitDate: null }, ...(cursor ? { id: { gt: cursor } } : {}) },
    include: people, orderBy: { id: "asc" }, take: 51
  });
  const staff = await prisma.employee.findMany({ where: { role: { in: ["ADMIN", "HR"] }, status: "ACTIVE", deletedAt: null, exitDate: null }, select: { id: true, role: true } });
  const hrMenu = await prisma.permissionSetting.findUnique({ where: { key: "hrMenuLeaveRequests" }, select: { value: true } });
  const permittedStaff = staff.filter(person => person.role !== "HR" || (hrMenu?.value ?? "true") === "true");
  const hrIds = permittedStaff.filter(person => person.role === "HR").map(person => person.id), staffIds = permittedStaff.map(person => person.id);
  const stats = { checked: 0, notificationsCreated: 0, pushAttempts: 0, duplicateAlertsSkipped: 0, nextCursor: rows.length > 50 ? rows[49].id : null as string | null };
  const pushes: Array<{ ids: string[]; title: string; text: string; id: string; requestId: string }> = [];
  try {
  for (const row of rows.slice(0, 50)) {
    stats.checked++;
    const due = dueLeaveReminders(row, now);
    if (!due.length) continue;
    let managers: Array<{ id: string }> = [];
    if (due.some(event => event.kind === "LEAVE_MANAGER_REMINDER")) {
      if (String(row.requester.department || "").trim().toUpperCase() === "DESIGNING") {
        const head = await prisma.employee.findFirst({ where: { status: "ACTIVE", deletedAt: null, exitDate: null, OR: [
          { employeeCode: "7222" }, { mobile: "9461093869" }, { name: { equals: "Cheshta Malik", mode: "insensitive" } }
        ] }, select: { id: true } });
        if (head && head.id !== row.requesterId) managers = [head];
      } else if (!row.requester.isFloorManager) managers = await findManagersForEmployee(row.requester);
    }
    for (const event of due) {
      const ids = Array.from(new Set(event.kind === "LEAVE_MANAGER_REMINDER" ? managers.map(manager => manager.id) : event.kind === "LEAVE_MANAGER_PENDING_24H" ? hrIds : staffIds));
      if (!ids.length) continue;
      const id = "leave-alert-" + createHash("sha256").update(event.key).digest("hex");
      const title = event.kind === "LEAVE_MANAGER_REMINDER" ? "Leave Decision Reminder" : event.kind === "LEAVE_MANAGER_PENDING_24H" ? "Manager Action Pending" : "Urgent—Leave Starting Soon";
      const text = `${title}: ${row.requester.name}'s leave for ${range(row.fromDate, row.toDate)} is pending. ${event.kind === "LEAVE_MANAGER_REMINDER" ? "Please approve or reject the manager/head stage." : event.kind === "LEAVE_MANAGER_PENDING_24H" ? "No manager/head decision has been recorded for at least 24 hours." : "Leave starts within the next 24 hours (India time)."}`;
      try {
        const saved = await prisma.$transaction(async tx => {
          // Serialize with manager/HR decisions; never create a reminder from a stale state.
          await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "LeaveRequest" WHERE "id" = ${row.id} FOR UPDATE`);
          const current = await tx.leaveRequest.findUnique({ where: { id: row.id }, include: people });
          if (!current || current.requester.status !== "ACTIVE" || current.requester.deletedAt || current.requester.exitDate ||
            !dueLeaveReminders(current, now).some(item => item.key === event.key)) return false;
          if (event.kind === "LEAVE_MANAGER_REMINDER") {
            const latest = await tx.notificationBlast.findFirst({ where: { filterType: "SYSTEM", filterValue: { startsWith: `LEAVE_MANAGER_REMINDER:${row.id}:` } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
            if (latest && now.getTime() - latest.createdAt.getTime() < 6 * 3600000) return false;
          }
          const recipients = await tx.employee.findMany({ where: { id: { in: ids }, status: "ACTIVE", deletedAt: null, exitDate: null }, select: { id: true } });
          if (!recipients.length) return false;
          await tx.notificationBlast.create({ data: { id, type: "NOTICE", text, filterType: "SYSTEM", filterValue: leaveReminderAction(event.kind, row.id, event.slot),
            createdById: row.requesterId, createdAt: now, recipients: { create: recipients.map(person => ({ employeeId: person.id })) } } });
          return recipients.map(person => person.id);
        });
        if (saved) { stats.notificationsCreated++; pushes.push({ ids: saved, title, text, id, requestId: row.id }); }
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "P2002") { stats.duplicateAlertsSkipped++; continue; }
        throw error;
      }
    }
  }
  } finally {
  // Push is supplementary to the durable bell notification, as in the existing app.
  for (let i = 0; i < pushes.length; i += 10) await Promise.all(pushes.slice(i, i + 10).map(async item => {
    stats.pushAttempts++;
    await sendPushToEmployees(item.ids, { title: item.title, body: item.text, url: leaveRequestTarget(item.requestId), tag: item.id }).catch(() => null);
  }));
  }
  return stats;
}
