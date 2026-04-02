import { createPublicClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const { events } = await request.json();

  if (!Array.isArray(events) || events.length === 0) {
    return Response.json({ error: "events array required" }, { status: 400 });
  }

  // Cap batch size
  const batch = events.slice(0, 50);

  const supabase = createPublicClient();

  const rows = batch.map((e: Record<string, unknown>) => ({
    event_type: String(e.event_type || "unknown"),
    page_path: String(e.page_path || "/"),
    observation_id: e.observation_id || null,
    meditation_id: e.meditation_id || null,
    metadata: e.metadata || null,
    session_id: String(e.session_id || ""),
    created_at: e.created_at || new Date().toISOString(),
  }));

  const { error } = await supabase.from("analytics_events").insert(rows);

  if (error) {
    console.error("[analytics] Insert failed:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, count: rows.length });
}
