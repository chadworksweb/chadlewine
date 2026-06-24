import { createAdminClient } from "@/lib/supabase-server";
import { summarizeHumanClicks } from "@/lib/click-analytics";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/admin/campaigns/[id]/click-metrics
// uniqueLinkClicks = distinct (recipient, link) among real human clicks.
// totalClicks      = every human click event.
// bySend           = human click count per recipient (campaign_send id), used
//                    to show honest per-recipient numbers in the editor table.
//
// Resend stamps every click with the "Amazon CloudFront" user-agent (it fronts
// the click redirect), so humans and scanners can't be told apart by UA. They
// ARE separated by timing in summarizeHumanClicks: a gateway pre-fetch fires a
// burst of clicks to one recipient within ~2s; a human clicks over time.
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
    .select("campaign_send_id, url, user_agent, ip_address, created_at")
    .eq("campaign_id", id)
    .eq("event_type", "clicked");
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(summarizeHumanClicks(data || []));
}
