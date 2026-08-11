import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/utils";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN") throw new Error("Only Admin allowed.");

    const url = new URL(req.url);
    const status = String(url.searchParams.get("status") || "All");
    const search = String(url.searchParams.get("search") || "").trim();
    const from = String(url.searchParams.get("from") || "").trim();
    const to = String(url.searchParams.get("to") || "").trim();

    const where: any = {};
    if (status === "Success") where.success = true;
    if (status === "Failed") where.success = false;
    if (search) {
      where.OR = [
        { username: { contains: search } },
        { employeeName: { contains: search } },
        { ipAddress: { contains: search } }
      ];
    }
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(`${from}T00:00:00`);
      if (to) where.createdAt.lte = new Date(`${to}T23:59:59`);
    }

    const [attempts, total, success, failed] = await Promise.all([
      (prisma as any).loginAttempt.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 }),
      (prisma as any).loginAttempt.count(),
      (prisma as any).loginAttempt.count({ where: { success: true } }),
      (prisma as any).loginAttempt.count({ where: { success: false } })
    ]);

    return ok({ attempts, summary: { total, success, failed } });
  } catch (e) {
    return fail(e, 401);
  }
}
