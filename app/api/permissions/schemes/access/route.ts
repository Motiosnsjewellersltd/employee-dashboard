import { requireSession } from "@/lib/auth";
import { hasSchemeAccess } from "@/lib/schemeAccess";
import { fail, ok } from "@/lib/utils";

// Expose only the logged-in employee's own visibility, never a list of grants.
export async function GET() {
  try {
    const session = await requireSession();
    const visible = await hasSchemeAccess(session.id, session.role);
    return ok({ visible });
  } catch (error) {
    return fail(error, 401);
  }
}
