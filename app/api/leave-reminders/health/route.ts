export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ ok: true, version: "leave-reminders-v1" }, { headers: { "Cache-Control": "no-store" } });
}
