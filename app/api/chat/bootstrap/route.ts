import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { employeeSelect, fail, ok } from "@/lib/utils";
import { allowedChatEmployeeIds } from "@/lib/chatPermissions";

export async function GET() {
  try {
    const session = await requireSession();
    const employees = await prisma.employee.findMany({ where: { status: "ACTIVE", deletedAt: null, exitDate: null }, orderBy: { name: "asc" } });
    const allowedIds = await allowedChatEmployeeIds(session.id, employees.map(e => e.id));
    const visibleEmployees = employees.filter(e => e.id === session.id || allowedIds.has(e.id));

    const threads = await prisma.chatThread.findMany({
      where: { participants: { some: { employeeId: session.id } } },
      include: { participants: { include: { employee: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { updatedAt: "desc" }
    });

    return ok({
      users: visibleEmployees.map(employeeSelect),
      threads: threads.flatMap((t: any) => {
        const selfParticipant = t.participants.find((p: any) => p.employeeId === session.id);
        const otherParticipant = t.participants.find((p: any) => p.employeeId !== session.id);
        if (!otherParticipant?.employee || !allowedIds.has(otherParticipant.employeeId)) return [];
        return [{
          id: t.id,
          updatedAt: t.updatedAt,
          unread: selfParticipant?.unread || 0,
          other: employeeSelect(otherParticipant.employee),
          lastMessage: t.messages[0] || null
        }];
      })
    });
  } catch (e) { return fail(e, 401); }
}
