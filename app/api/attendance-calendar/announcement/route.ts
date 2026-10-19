import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fail, ok } from "@/lib/utils";
import { isWebPushConfigured, sendPushToEmployees } from "@/lib/webPush";
import { CALENDAR_ANNOUNCEMENT_ID, CALENDAR_ANNOUNCEMENT_TEXT, CALENDAR_ANNOUNCEMENT_TITLE } from "@/lib/calendarAnnouncement";

export const runtime = "nodejs";

export async function POST() {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN") return fail("Only Admin can send this announcement.", 403);
    const existing = await prisma.notificationBlast.findUnique({ where: { id: CALENDAR_ANNOUNCEMENT_ID }, select: { id: true } });
    if (existing) return ok({ alreadySent: true });
    // Do not consume this one-time launch before push has been configured.
    if (!isWebPushConfigured()) return fail("Configure Web Push before sending the calendar announcement.", 503);
    const employees = await prisma.employee.findMany({
      where: { role: "EMPLOYEE", status: "ACTIVE", deletedAt: null, exitDate: null },
      select: { id: true }
    });
    if (!employees.length) return ok({ sent: 0 });
    const ids = employees.map(employee => employee.id);
    try {
      await prisma.notificationBlast.create({ data: {
        id: CALENDAR_ANNOUNCEMENT_ID, type: "INFORMATION", text: CALENDAR_ANNOUNCEMENT_TEXT,
        filterType: "SYSTEM", filterValue: "ATTENDANCE_CALENDAR_LAUNCH", createdById: session.id,
        recipients: { create: ids.map(employeeId => ({ employeeId })) }
      } });
    } catch (error) {
      // A second admin or React development replay must not send duplicates.
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") return ok({ alreadySent: true });
      throw error;
    }
    await sendPushToEmployees(ids, {
      title: CALENDAR_ANNOUNCEMENT_TITLE, body: CALENDAR_ANNOUNCEMENT_TEXT,
      url: "/?section=notifications", tag: CALENDAR_ANNOUNCEMENT_ID
    });
    return ok({ sent: ids.length, pushAttempted: true });
  } catch (error) { return fail(error); }
}
