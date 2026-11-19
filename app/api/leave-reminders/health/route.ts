export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ ok: true, version: "leave-reminders-v2" }, { headers: { "Cache-Control": "no-store" } });
}
