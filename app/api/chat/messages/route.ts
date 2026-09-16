import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fail, ok, saveUpload } from "@/lib/utils";
import { sendPushToEmployees } from "@/lib/webPush";

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const form = await req.formData();
    const threadId = String(form.get("threadId") || "");
    const text = String(form.get("text") || "").trim();
    const file = form.get("attachment") as File | null;
    if (!threadId) throw new Error("Thread required.");
    if (!text && (!file || !file.size)) throw new Error("Message required.");
    const part = await prisma.chatParticipant.findUnique({ where: { threadId_employeeId: { threadId, employeeId: session.id } } });
    if (!part) throw new Error("Unauthorized");
    let attachmentUrl = "";
    let attachmentName = "";
    if (file && file.size) {
      attachmentUrl = await saveUpload(file, "chat");
      attachmentName = file.name;
    }
    const message = await prisma.chatMessage.create({ data: { threadId, senderId: session.id, text, attachmentUrl: attachmentUrl || null, attachmentName: attachmentName || null } });
    await prisma.chatThread.update({ where: { id: threadId }, data: { updatedAt: new Date() } });
    await prisma.chatParticipant.updateMany({ where: { threadId, employeeId: { not: session.id } }, data: { unread: { increment: 1 } } });
    const recipients = await prisma.chatParticipant.findMany({
      where: { threadId, employeeId: { not: session.id } },
      select: { employeeId: true }
    });
    await sendPushToEmployees(recipients.map(recipient => recipient.employeeId), {
      title: session.name,
      body: text || `Sent an attachment${attachmentName ? `: ${attachmentName}` : ""}`,
      url: `/?section=chat&employeeId=${encodeURIComponent(session.id)}`,
      tag: `chat-${threadId}`,
    });
    return ok({ message });
  } catch (e) { return fail(e); }
}
