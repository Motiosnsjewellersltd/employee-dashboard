import { prisma } from "@/lib/prisma";
import { AssetError, assetAccess, assetFailure } from "@/lib/assetHandover";

export const runtime = "nodejs";
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await assetAccess();
    const { id } = await context.params;
    const file = await prisma.assetHandoverAttachment.findUnique({ where: { id } });
    if (!file) throw new AssetError("Receipt/photo not found.", 404);
    const name = file.fileName.replace(/[^a-zA-Z0-9._ -]/g, "_");
    return new Response(new Uint8Array(file.fileData), { headers: {
      "Content-Type": file.fileType, "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"
    } });
  } catch (e) { return assetFailure(e); }
}
