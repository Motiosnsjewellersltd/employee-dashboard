import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/utils";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    if (!["ADMIN", "HR"].includes(session.role)) throw new Error("Only Admin/HR allowed.");

    const url = new URL(req.url);
    const action = String(url.searchParams.get("action") || "").trim();
    const search = String(url.searchParams.get("search") || "").trim();
    const from = String(url.searchParams.get("from") || "").trim();
    const to = String(url.searchParams.get("to") || "").trim();

    const where: any = {};
    if (action && action !== "All") where.action = action;
    if (search) where.OR = [{ actorName: { contains: search } }, { target: { contains: search } }, { details: { contains: search } }];
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(`${from}T00:00:00`);
      if (to) where.createdAt.lte = new Date(`${to}T23:59:59`);
    }

    const logs = await (prisma as any).activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500
    });

    return ok({ logs });
  } catch (e) {
    return fail(e, 401);
  }
}
