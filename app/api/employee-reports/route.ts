import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { requireHrPermission } from "@/lib/permissions";
import { addAuditLog } from "@/lib/audit";
import { sendPushToEmployees } from "@/lib/webPush";
import { fail, ok } from "@/lib/utils";

const reportSelect = {
  id: true,
  employeeId: true,
  title: true,
  fromDate: true,
  toDate: true,
  fileName: true,
  fileType: true,
  fileSize: true,
  uploadedById: true,
  createdAt: true,
  updatedAt: true,

  employee: {
    select: {
      id: true,
      employeeCode: true,
      name: true,
      designation: true,
      department: true,
      branch: true,
      reportingRequired: true
    }
  },

  uploadedBy: {
    select: {
      id: true,
      name: true,
      role: true
    }
  }
};

function parseDate(value: string) {
  const date = new Date(`${value}T12:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid report date.");
  }

  return date;
}

async function ensureManager(session: any) {
  if (
    session.role !== "ADMIN" &&
    session.role !== "HR"
  ) {
    throw new Error(
      "Only Admin/HR can manage reports."
    );
  }

  await requireHrPermission(
    session.role,
    "hrCanManageReports",
    "HR is not allowed to manage employee reports."
  );
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();

    const params =
      new URL(req.url).searchParams;

    let employeeId =
      String(
        params.get("employeeId") || ""
      ).trim();

    if (session.role === "EMPLOYEE") {
      employeeId = session.id;
    } else if (session.role === "HR") {
      await requireHrPermission(
        session.role,
        "hrMenuReporting",
        "Reporting Management is not available for HR."
      );
    }

    if (!employeeId) {
      return ok({
        employee: null,
        reports: []
      });
    }

    const employee =
      await prisma.employee.findUnique({
        where: {
          id: employeeId
        },

        select: {
          id: true,
          employeeCode: true,
          name: true,
          designation: true,
          department: true,
          branch: true,
          status: true,
          reportingRequired: true
        }
      });

    if (!employee) {
      throw new Error(
        "Employee not found."
      );
    }

    if (
      session.role === "EMPLOYEE" &&
      !employee.reportingRequired
    ) {
      return ok({
        employee,
        reports: []
      });
    }

    const reports =
      await prisma.employeeReport.findMany({
        where: {
          employeeId
        },

        select: reportSelect,

        orderBy: [
          {
            toDate: "desc"
          },
          {
            createdAt: "desc"
          }
        ],

        take: 500
      });

    return ok({
      employee,
      reports
    });
  } catch (error) {
    return fail(error, 401);
  }
}

export async function PATCH(
  req: NextRequest
) {
  try {
    const session =
      await requireSession();

    await ensureManager(session);

    const body = await req.json();

    const employeeId =
      String(
        body.employeeId || ""
      ).trim();

    const reportingRequired =
      Boolean(
        body.reportingRequired
      );

    if (!employeeId) {
      throw new Error(
        "Select employee."
      );
    }

    const employee =
      await prisma.employee.update({
        where: {
          id: employeeId
        },

        data: {
          reportingRequired
        },

        select: {
          id: true,
          employeeCode: true,
          name: true,
          reportingRequired: true
        }
      });

    await addAuditLog({
      actorId: session.id,
      actorName: session.name,
      action:
        reportingRequired
          ? "ENABLE_EMPLOYEE_REPORTING"
          : "DISABLE_EMPLOYEE_REPORTING",
      target: employee.id,
      details: {
        employeeName:
          employee.name
      }
    });

    return ok({
      employee
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(
  req: NextRequest
) {
  try {
    const session =
      await requireSession();

    await ensureManager(session);

    const form =
      await req.formData();

    const employeeId =
      String(
        form.get("employeeId") ||
          ""
      ).trim();

    const title =
      String(
        form.get("title") || ""
      ).trim();

    const fromDateText =
      String(
        form.get("fromDate") || ""
      ).trim();

    const toDateText =
      String(
        form.get("toDate") || ""
      ).trim();

    const file =
      form.get("file");

    if (!employeeId) {
      throw new Error(
        "Select employee."
      );
    }

    if (!title) {
      throw new Error(
        "Report title is required."
      );
    }

    if (
      !fromDateText ||
      !toDateText
    ) {
      throw new Error(
        "From Date and To Date are required."
      );
    }

    const fromDate =
      parseDate(fromDateText);

    const toDate =
      parseDate(toDateText);

    if (toDate < fromDate) {
      throw new Error(
        "To Date cannot be before From Date."
      );
    }

    if (
      !(file instanceof File)
    ) {
      throw new Error(
        "Select PDF report."
      );
    }

    const fileName =
      String(
        file.name || "report.pdf"
      );

    const isPdf =
      file.type ===
        "application/pdf" ||
      fileName
        .toLowerCase()
        .endsWith(".pdf");

    if (!isPdf) {
      throw new Error(
        "Only PDF files are allowed."
      );
    }

    const maxSize =
      4 * 1024 * 1024;

    if (file.size > maxSize) {
      throw new Error(
        "PDF must be 4 MB or smaller."
      );
    }

    const employee =
      await prisma.employee.findUnique({
        where: {
          id: employeeId
        },

        select: {
          id: true,
          name: true
        }
      });

    if (!employee) {
      throw new Error(
        "Employee not found."
      );
    }

    const bytes =
      Buffer.from(
        await file.arrayBuffer()
      );

    const report =
      await prisma.$transaction(
        async tx => {
          await tx.employee.update({
            where: {
              id: employeeId
            },

            data: {
              reportingRequired: true
            }
          });

          return tx.employeeReport.create({
            data: {
              employeeId,
              title,
              fromDate,
              toDate,

              fileName,
              fileType:
                "application/pdf",
              fileSize:
                file.size,
              fileData:
                bytes,

              uploadedById:
                session.id
            },

            select: reportSelect
          });
        }
      );

    const period =
      `${fromDateText} to ${toDateText}`;

    await prisma.notificationBlast.create({
      data: {
        type: "INFORMATION",

        text:
          `New report uploaded: ${title} (${period}).`,

        filterType:
          "SYSTEM",

        filterValue:
          "EMPLOYEE_REPORT",

        createdById:
          session.id,

        recipients: {
          create: [
            {
              employeeId
            }
          ]
        }
      }
    });

    await sendPushToEmployees(
      [employeeId],
      {
        title:
          "New Report Uploaded",

        body:
          `${title} (${period})`,

        url:
          "/?section=reporting",

        tag:
          `employee-report-${report.id}`
      }
    );

    await addAuditLog({
      actorId: session.id,
      actorName: session.name,
      action:
        "UPLOAD_EMPLOYEE_REPORT",
      target: report.id,
      details: {
        employeeId,
        employeeName:
          employee.name,
        title,
        fromDate:
          fromDateText,
        toDate:
          toDateText,
        fileName
      }
    });

    return ok({
      report
    });
  } catch (error) {
    return fail(error);
  }
}