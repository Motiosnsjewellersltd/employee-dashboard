import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { requireHrPermission } from "@/lib/permissions";
import { addAuditLog } from "@/lib/audit";
import { fail, ok } from "@/lib/utils";

async function getId(
  context: {
    params:
      | Promise<{ id: string }>
      | { id: string };
  }
) {
  const params =
    await context.params;

  return String(
    params.id || ""
  ).trim();
}

async function ensureManager(
  role: string
) {
  if (
    role !== "ADMIN" &&
    role !== "HR"
  ) {
    throw new Error(
      "Only Admin/HR can manage reports."
    );
  }

  await requireHrPermission(
    role,
    "hrCanManageReports",
    "HR is not allowed to manage employee reports."
  );
}

function parseDate(
  value: string
) {
  const date =
    new Date(
      `${value}T12:00:00.000Z`
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw new Error(
      "Invalid report date."
    );
  }

  return date;
}

export async function PATCH(
  req: NextRequest,
  context: {
    params:
      | Promise<{ id: string }>
      | { id: string };
  }
) {
  try {
    const session =
      await requireSession();

    await ensureManager(
      session.role
    );

    const id =
      await getId(context);

    if (!id) {
      throw new Error(
        "Report is required."
      );
    }

    const current =
      await prisma.employeeReport.findUnique({
        where: { id },

        select: {
          id: true,
          employeeId: true,
          title: true,
          fromDate: true,
          toDate: true,
          fileName: true
        }
      });

    if (!current) {
      throw new Error(
        "Report not found."
      );
    }

    const contentType =
      req.headers.get(
        "content-type"
      ) || "";

    let data: any = {};

    if (
      contentType.includes(
        "multipart/form-data"
      )
    ) {
      const form =
        await req.formData();

      const title =
        String(
          form.get("title") ||
            current.title
        ).trim();

      const fromDateText =
        String(
          form.get("fromDate") ||
            ""
        ).trim();

      const toDateText =
        String(
          form.get("toDate") ||
            ""
        ).trim();

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
        parseDate(
          fromDateText
        );

      const toDate =
        parseDate(
          toDateText
        );

      if (
        toDate < fromDate
      ) {
        throw new Error(
          "To Date cannot be before From Date."
        );
      }

      data = {
        title,
        fromDate,
        toDate
      };

      const file =
        form.get("file");

      if (
        file instanceof File &&
        file.size > 0
      ) {
        const fileName =
          String(
            file.name ||
              "report.pdf"
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

        if (
          file.size >
          maxSize
        ) {
          throw new Error(
            "PDF must be 4 MB or smaller."
          );
        }

        data.fileName =
          fileName;

        data.fileType =
          "application/pdf";

        data.fileSize =
          file.size;

        data.fileData =
          Buffer.from(
            await file.arrayBuffer()
          );
      }
    } else {
      const body =
        await req.json();

      const title =
        String(
          body.title ||
            current.title
        ).trim();

      const fromDateText =
        String(
          body.fromDate || ""
        ).trim();

      const toDateText =
        String(
          body.toDate || ""
        ).trim();

      if (!title) {
        throw new Error(
          "Report title is required."
        );
      }

      const fromDate =
        parseDate(
          fromDateText
        );

      const toDate =
        parseDate(
          toDateText
        );

      if (
        toDate < fromDate
      ) {
        throw new Error(
          "To Date cannot be before From Date."
        );
      }

      data = {
        title,
        fromDate,
        toDate
      };
    }

    const report =
      await prisma.employeeReport.update({
        where: { id },

        data,

        select: {
          id: true,
          employeeId: true,
          title: true,
          fromDate: true,
          toDate: true,
          fileName: true,
          fileType: true,
          fileSize: true,
          createdAt: true,
          updatedAt: true
        }
      });

    await addAuditLog({
      actorId: session.id,
      actorName: session.name,
      action:
        "UPDATE_EMPLOYEE_REPORT",
      target: id,
      details: {
        employeeId:
          current.employeeId,
        previousFile:
          current.fileName,
        fileName:
          report.fileName
      }
    });

    return ok({
      report
    });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  context: {
    params:
      | Promise<{ id: string }>
      | { id: string };
  }
) {
  try {
    const session =
      await requireSession();

    await ensureManager(
      session.role
    );

    const id =
      await getId(context);

    const report =
      await prisma.employeeReport.findUnique({
        where: { id },

        select: {
          id: true,
          employeeId: true,
          title: true,
          fileName: true
        }
      });

    if (!report) {
      throw new Error(
        "Report not found."
      );
    }

    await prisma.employeeReport.delete({
      where: { id }
    });

    await addAuditLog({
      actorId: session.id,
      actorName: session.name,
      action:
        "DELETE_EMPLOYEE_REPORT",
      target: id,
      details: {
        employeeId:
          report.employeeId,
        title:
          report.title,
        fileName:
          report.fileName
      }
    });

    return ok({
      deleted: true
    });
  } catch (error) {
    return fail(error);
  }
}