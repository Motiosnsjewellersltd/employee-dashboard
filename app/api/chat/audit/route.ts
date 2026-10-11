import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { fail, ok } from "@/lib/utils";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN") throw new Error("Only Admin can view chat audit.");

    const threadId = new URL(req.url).searchParams.get("threadId")?.trim() || "";

    if (threadId) {
      const thread = await prisma.chatThread.findUnique({
        where: { id: threadId },
        include: {
          participants: {
            include: { employee: true }
          },
          messages: {
            include: { sender: true },
            orderBy: { createdAt: "asc" },
            take: 1000
          }
        }
      });
      if (!thread) throw new Error("Conversation not found.");

      return ok({
        conversation: {
          id: thread.id,
          participants: thread.participants.map((p: any) => ({
            id: p.employee.id,
            employeeCode: p.employee.employeeCode,
            name: p.employee.name,
            mobile: p.employee.mobile,
            designation: p.employee.designation,
            department: p.employee.department,
            photoUrl: p.employee.photoUrl
          })),
          messages: thread.messages.map((m: any) => ({
            id: m.id,
            senderId: m.senderId,
            senderName: m.sender.name,
            text: m.text,
            attachmentUrl: m.attachmentUrl,
            attachmentName: m.attachmentName,
            isEdited: m.isEdited,
            createdAt: m.createdAt,
            updatedAt: m.updatedAt
          }))
        }
      });
    }

    const threads = await prisma.chatThread.findMany({
      include: {
        participants: { include: { employee: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { messages: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: 2000
    });

    return ok({
      threads: threads.map((t: any) => ({
        id: t.id,
        updatedAt: t.updatedAt,
        messageCount: t._count.messages,
        participants: t.participants.map((p: any) => ({
          id: p.employee.id,
          employeeCode: p.employee.employeeCode,
          name: p.employee.name,
          mobile: p.employee.mobile,
          designation: p.employee.designation,
          department: p.employee.department,
          photoUrl: p.employee.photoUrl
        })),
        lastMessage: t.messages[0]
          ? {
              senderId: t.messages[0].senderId,
              text: t.messages[0].text,
              attachmentName: t.messages[0].attachmentName,
              createdAt: t.messages[0].createdAt
            }
          : null
      }))
    });
  } catch (e) {
    return fail(e, 401);
  }
}
