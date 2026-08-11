import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/utils";

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const body = await req.json();
    const msg = await prisma.chatMessage.findUnique({ where: { id } });
    if (!msg || msg.senderId !== session.id) throw new Error("Unauthorized");
    if (Date.now() - new Date(msg.createdAt).getTime() > 5 * 60 * 1000) throw new Error("Message edit time expired.");
    const updated = await prisma.chatMessage.update({ where: { id }, data: { text: String(body.text || ""), isEdited: true } });
    return ok({ message: updated });
  } catch (e) { return fail(e); }
}
