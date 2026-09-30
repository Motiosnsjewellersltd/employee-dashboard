import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { addAuditLog } from "@/lib/audit";
import { requireHrPermission } from "@/lib/permissions";
import { addSystemNotification } from "@/lib/systemNotification";
import { sendPushToEmployees } from "@/lib/webPush";
import { fail, ok } from "@/lib/utils";

const includePeople = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      name: true,
      mobile: true,
      designation: true,
      department: true,
      branch: true
    }
  },
  resolvedBy: {
    select: {
      id: true,
      name: true,
      role: true
    }
  }
};

function ticketNumber() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Kolkata"
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(part => [part.type, part.value])
  );

  const date = `${values.year}${values.month}${values.day}`;

  return `TKT-${date}-${randomUUID()
    .replace(/-/g, "")
    .slice(0, 8)
    .toUpperCase()}`;
}

export async function GET() {
  try {
    const session = await requireSession();

    const canManage =
      session.role === "ADMIN" || session.role === "HR";

    if (session.role === "HR") {
      await requireHrPermission(
        session.role,
        "hrMenuHelpTickets",
        "Help Tickets menu is not available for HR."
      );
    }

    const tickets = await prisma.helpTicket.findMany({
      where: canManage
        ? undefined
        : {
            employeeId: session.id
          },

      include: includePeople,

      orderBy: [
        {
          status: "asc"
        },
        {
          createdAt: "desc"
        }
      ],

      take: 1000
    });

    return ok({
      tickets
    });
  } catch (error) {
    return fail(error, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();

    const body = await req.json();

    const category = String(
      body.category || "OTHER"
    )
      .trim()
      .toUpperCase();

    const subject = String(
      body.subject || ""
    ).trim();

    const description = String(
      body.description || ""
    ).trim();

    if (!subject) {
      throw new Error(
        "Ticket subject is required."
      );
    }

    if (!description) {
      throw new Error(
        "Ticket details are required."
      );
    }

    if (subject.length > 150) {
      throw new Error(
        "Ticket subject must be 150 characters or less."
      );
    }

    const ticket = await prisma.helpTicket.create({
      data: {
        ticketNumber: ticketNumber(),
        employeeId: session.id,
        category,
        subject,
        description
      },

      include: includePeople
    });

    await addAuditLog({
      actorId: session.id,
      actorName: session.name,
      action: "CREATE_HELP_TICKET",
      target: ticket.ticketNumber,
      details: {
        category,
        subject
      }
    });

    await addSystemNotification({
      actorId: session.id,
      action: "NEW_HELP_TICKET",
      title: "New Help Ticket",
      text: `${session.name} raised ${ticket.ticketNumber}: ${subject}`,
      type: "NOTICE",
      url: "/?section=helpTickets"
    });

    return ok({
      ticket
    });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();

    if (
      session.role !== "ADMIN" &&
      session.role !== "HR"
    ) {
      throw new Error(
        "Only Admin/HR can update help tickets."
      );
    }

    await requireHrPermission(
      session.role,
      "hrCanManageHelpTickets",
      "HR is not allowed to update help tickets."
    );

    const body = await req.json();

    const id = String(
      body.id || ""
    ).trim();

    const status = String(
      body.status || ""
    )
      .trim()
      .toUpperCase();

    const solution = String(
      body.solution || ""
    ).trim();

    if (!id) {
      throw new Error(
        "Ticket is required."
      );
    }

    if (
      ![
        "OPEN",
        "IN_PROGRESS",
        "RESOLVED"
      ].includes(status)
    ) {
      throw new Error(
        "Select a valid ticket status."
      );
    }

    if (
      status === "RESOLVED" &&
      !solution
    ) {
      throw new Error(
        "Solution is required before resolving the ticket."
      );
    }

    const current =
      await prisma.helpTicket.findUnique({
        where: {
          id
        },

        include: includePeople
      });

    if (!current) {
      throw new Error(
        "Help ticket not found."
      );
    }

    const ticket =
      await prisma.helpTicket.update({
        where: {
          id
        },

        data: {
          status:
            status as
              | "OPEN"
              | "IN_PROGRESS"
              | "RESOLVED",

          solution:
            status === "RESOLVED"
              ? solution
              : null,

          resolvedById:
            status === "RESOLVED"
              ? session.id
              : null,

          resolvedAt:
            status === "RESOLVED"
              ? new Date()
              : null
        },

        include: includePeople
      });

    const statusText =
      status === "RESOLVED"
        ? `resolved by ${session.name}. Solution: ${solution}`
        : status === "IN_PROGRESS"
        ? `is now in progress. Updated by ${session.name}.`
        : `was reopened by ${session.name}.`;

    const notificationText =
      `${ticket.ticketNumber} (${ticket.subject}) ${statusText}`;

    await prisma.notificationBlast.create({
      data: {
        type: "INFORMATION",
        text: notificationText,
        filterType: "SYSTEM",
        filterValue:
          `HELP_TICKET_${status}`,
        createdById: session.id,

        recipients: {
          create: [
            {
              employeeId:
                current.employeeId
            }
          ]
        }
      }
    });

    await sendPushToEmployees(
      [current.employeeId],
      {
        title:
          status === "RESOLVED"
            ? "Help Ticket Resolved"
            : "Help Ticket Updated",

        body: notificationText,

        url:
          "/?section=helpTickets",

        tag:
          `help-ticket-${ticket.id}`
      }
    );

    await addAuditLog({
      actorId: session.id,
      actorName: session.name,
      action:
        "UPDATE_HELP_TICKET",

      target:
        ticket.ticketNumber,

      details: {
        status,

        solution:
          status === "RESOLVED"
            ? solution
            : undefined
      }
    });

    return ok({
      ticket
    });
  } catch (error) {
    return fail(error);
  }
}