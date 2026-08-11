import { prisma } from "@/lib/prisma";

export async function addSystemNotification(input: {
  actorId: string;
  action: string;
  text: string;
  type?: "INVITATION" | "INFORMATION" | "CELEBRATION" | "NOTICE";
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
  } catch {
    // System notifications must never stop the main action.
  }
}
