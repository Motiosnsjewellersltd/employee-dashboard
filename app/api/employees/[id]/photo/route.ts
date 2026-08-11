import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { employeeSelect, fail, ok, saveUpload } from "@/lib/utils";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;

    if (!["ADMIN", "HR"].includes(session.role) && session.id !== id) {
      throw new Error("Unauthorized");
    }

    const form = await req.formData();
    const file = form.get("photo") as File | null;

    if (!file || file.size === 0) {
      throw new Error("Photo required.");
    }

    const active = await prisma.employee.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!active) throw new Error("Employee not found.");

    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type || "")) throw new Error("Only JPG, PNG, WEBP or GIF photo allowed.");
    if (file.size > 4 * 1024 * 1024) throw new Error("Photo size must be 4 MB or less.");

    const photoUrl = await saveUpload(file, "photos");

    const employee = await prisma.employee.update({
      where: { id },
      data: { photoUrl }
    });

    return ok({ employee: employeeSelect(employee) });
  } catch (e) {
    return fail(e);
  }
}
