import { clearAuthCookie } from "@/lib/auth";
import { ok } from "@/lib/utils";
export async function POST() {
  await clearAuthCookie();
  return ok();
}
