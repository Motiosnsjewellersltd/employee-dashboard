import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const otherId = String(body.employeeId || "");
    if (!otherId || otherId === session.id) throw new Error("Select employee.");
    const existing = await prisma.chatThread.findFirst({
      where: { AND: [
        { participants: { some: { employeeId: session.id } } },
        { participants: { some: { employeeId: otherId } } }
      ] },
      include: { participants: true }
    });
    if (existing) return ok({ threadId: existing.id });
    const thread = await prisma.chatThread.create({ data: { participants: { create: [{ employeeId: session.id }, { employeeId: otherId }] } } });
    return ok({ threadId: thread.id });
  } catch (e) { return fail(e); }
}
