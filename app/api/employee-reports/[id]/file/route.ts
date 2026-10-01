import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { requireHrPermission } from "@/lib/permissions";

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

function safeFileName(
  value: string
) {
  return value
    .replace(
      /[\r\n"]/g,
      ""
    )
    .replace(
      /[^a-zA-Z0-9._ -]/g,
      "_"
    );
}

export async function GET(
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

    const id =
      await getId(context);

    const report =
      await prisma.employeeReport.findUnique({
        where: { id },

        select: {
          id: true,
          employeeId: true,
          fileName: true,
          fileType: true,
          fileData: true
        }
      });

    if (!report) {
      return new Response(
        "Report not found.",
        {
          status: 404
        }
      );
    }

    const manager =
      session.role === "ADMIN" ||
      session.role === "HR";

    if (
      !manager &&
      report.employeeId !==
        session.id
    ) {
      return new Response(
        "Access denied.",
        {
          status: 403
        }
      );
    }

    if (
      session.role === "HR"
    ) {
      await requireHrPermission(
        session.role,
        "hrMenuReporting",
        "Reporting Management is not available for HR."
      );
    }

    const download =
      new URL(
        req.url
      ).searchParams.get(
        "download"
      ) === "1";

    const fileName =
  safeFileName(
    report.fileName ||
      "report"
  );

    return new Response(
      report.fileData,
      {
        headers: {
          "Content-Type":
            report.fileType ||
            "application/pdf",

          "Content-Disposition":
            `${
              download
                ? "attachment"
                : "inline"
            }; filename="${fileName}"`,

          "Cache-Control":
            "private, no-store"
        }
      }
    );
  } catch {
    return new Response(
      "Unable to open report.",
      {
        status: 401
      }
    );
  }
}