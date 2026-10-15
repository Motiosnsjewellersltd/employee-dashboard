import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { hasSchemeAccess } from "@/lib/schemeAccess";
import { makeSchemeReport } from "@/lib/schemeReport";
import { fail, ok } from "@/lib/utils";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!await hasSchemeAccess(session.id, session.role)) {
      return Response.json({ ok: false, error: "Scheme & Incentives access is disabled." }, { status: 403 });
    }
    const selected = new URL(req.url).searchParams.get("scheme");
    if (selected !== "gold" && selected !== "bonus") {
      return Response.json({ ok: false, error: "Invalid scheme." }, { status: 400 });
    }
    const report = await makeSchemeReport(selected, session.name, session.branch || "");
    return ok(report);
  } catch (e) {
    return fail(e);
  }
}
