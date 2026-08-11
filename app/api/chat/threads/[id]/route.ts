import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/utils";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const part = await prisma.chatParticipant.findUnique({ where: { threadId_employeeId: { threadId: id, employeeId: session.id } } });
    if (!part) throw new Error("Unauthorized");
    await prisma.chatParticipant.update({ where: { id: part.id }, data: { unread: 0, lastReadAt: new Date() } });
    const messages = await prisma.chatMessage.findMany({ where: { threadId: id }, include: { sender: true }, orderBy: { createdAt: "asc" }, take: 300 });
    return ok({ messages: messages.map(m => ({ id: m.id, senderId: m.senderId, senderName: m.sender.name, text: m.text, attachmentUrl: m.attachmentUrl, attachmentName: m.attachmentName, isEdited: m.isEdited, createdAt: m.createdAt, updatedAt: m.updatedAt })) });
  } catch (e) { return fail(e, 401); }
}
