import { prisma } from "@/lib/prisma";
import { sendPushToEmployees } from "@/lib/webPush";

export async function addSystemNotification(input: {
  actorId: string;
  action: string;
  text: string;
  type?: "INVITATION" | "INFORMATION" | "CELEBRATION" | "NOTICE";
  title?: string;
  url?: string;
}) {
  try {
    const recipients = await prisma.employee.findMany({
      where: {
        status: "ACTIVE",
        deletedAt: null,
        role: { in: ["ADMIN", "HR"] }
      },
      select: { id: true }
    });

    if (!recipients.length) return;

    await prisma.notificationBlast.create({
      data: {
        type: input.type || "INFORMATION",
        text: input.text,
        filterType: "SYSTEM",
        filterValue: input.action,
        createdById: input.actorId,
        recipients: {
          create: recipients.map(recipient => ({ employeeId: recipient.id }))
        }
      }
    });
    await sendPushToEmployees(recipients.map(recipient => recipient.id), {
      title: input.title || "Employee Dashboard Update",
      body: input.text,
      url: input.url || "/?section=notifications",
      tag: `system-${input.action}`,
    });
  } catch {
    // System notifications must never stop the main action.
  }
}
