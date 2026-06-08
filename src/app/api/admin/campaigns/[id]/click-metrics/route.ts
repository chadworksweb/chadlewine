import { createAdminClient } from "@/lib/supabase-server";
import { isLikelyBotUserAgent } from "@/lib/bot-detection";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/admin/campaigns/[id]/click-metrics
// uniqueLinkClicks = distinct (recipient, link) -- each link a recipient clicks
//   counts once; clicking the same link again does not.
// totalClicks = every click event (same-link repeats included).
// Reads campaign_events (indexed on campaign_id). Clicks from email security
// scanners (by user-agent) are excluded so the numbers reflect humans.
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
    .select("campaign_send_id, url, user_agent")
    .eq("campaign_id", id)
    .eq("event_type", "clicked");
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Drop scanner clicks so unique/total reflect real recipients.
  const rows = (data || []).filter((r) => !isLikelyBotUserAgent(r.user_agent));
  const seen = new Set<string>();
  for (const r of rows) {
    seen.add(`${r.campaign_send_id ?? ""}|${r.url ?? ""}`);
  }
  return Response.json({
    uniqueLinkClicks: seen.size,
    totalClicks: rows.length,
  });
}
