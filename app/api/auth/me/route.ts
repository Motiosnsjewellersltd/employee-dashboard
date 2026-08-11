import { getSession } from "@/lib/auth";
import { ok } from "@/lib/utils";
export async function GET() {
  return ok({ user: await getSession() });
}
