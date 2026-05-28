import { createAdminClient } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/admin/campaigns/[id]/click-metrics
// uniqueLinkClicks = distinct (recipient, link) -- each link a recipient clicks
//   counts once; clicking the same link again does not.
// totalClicks = every click event (same-link repeats included).
// Reads campaign_events (indexed on campaign_id).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("campaign_events")
    .select("campaign_send_id, url")
    .eq("campaign_id", id)
    .eq("event_type", "clicked");
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const rows = data || [];
  const seen = new Set<string>();
  for (const r of rows) {
    seen.add(`${r.campaign_send_id ?? ""}|${r.url ?? ""}`);
  }
  return Response.json({
    uniqueLinkClicks: seen.size,
    totalClicks: rows.length,
  });
}
