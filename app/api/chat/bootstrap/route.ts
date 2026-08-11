import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { employeeSelect, fail, ok } from "@/lib/utils";

export async function GET() {
  try {
    const session = await requireSession();
    const employees = await prisma.employee.findMany({ where: { status: "ACTIVE", deletedAt: null }, orderBy: { name: "asc" } });
    const threads = await prisma.chatThread.findMany({
      where: { participants: { some: { employeeId: session.id } } },
      include: { participants: { include: { employee: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { updatedAt: "desc" }
    });
    return ok({
      users: employees.map(employeeSelect),
      threads: threads.map((t: any) => {
        const selfParticipant = t.participants.find((p: any) => p.employeeId === session.id);
        const otherParticipant = t.participants.find((p: any) => p.employeeId !== session.id);

        return {
          id: t.id,
          updatedAt: t.updatedAt,
          unread: selfParticipant?.unread || 0,
          other: otherParticipant?.employee ? employeeSelect(otherParticipant.employee) : null,
          lastMessage: t.messages[0] || null
        };
      })
    });
  } catch (e) { return fail(e, 401); }
}
