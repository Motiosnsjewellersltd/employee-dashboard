import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { GAME_LIBRARY } from "@/lib/quizActivityCatalog";
import { editableGame, validateGameContent } from "@/lib/quizGameContent";
export const GAME_LIBRARY_KEY = "dailyJewelleryGameContent";
export function gameRevision(game: unknown) { return createHash("sha256").update(JSON.stringify(game)).digest("hex"); }
export async function gameLibrary(db: Prisma.TransactionClient = prisma) {
  const row = await db.permissionSetting.findUnique({ where: { key: GAME_LIBRARY_KEY } });
  let saved: Record<string, unknown> = {};
  try { saved = JSON.parse(row?.value || "{}"); } catch { /* Keep the original library if stored JSON is malformed. */ }
  return GAME_LIBRARY.map(original => {
    if (saved && saved[original.id]) { try { return validateGameContent(saved[original.id]); } catch { /* An invalid override cannot break other games. */ } }
    return editableGame(original);
  });
}
