import { createAdminClient } from "@/lib/supabase-server";
import { sendCampaign, SYNC_SEND_AUDIENCE_LIMIT } from "@/lib/campaigns";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Default 60s Vercel route timeout — but on Hobby it's 10s. Since this can
// take longer than 10s even at modest list sizes, the in-route send is
// best for self-hosted or Vercel Pro setups. For Hobby with >50 subscribers,
// migrate to a background queue (see plans/abundant-whistling-wand.md).
export const maxDuration = 60;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: campaign, error: cErr } = await supabase
    .from("campaigns")
    .select("status, subject, body_html, body_blocks")
    .eq("id", id)
    .single();
  if (cErr || !campaign) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (campaign.status !== "draft") {
    return Response.json(
      { error: `Campaign is ${campaign.status}, not draft.` },
      { status: 409 }
    );
  }
  // Content lives in body_blocks (the block editor never writes body_html);
  // sendCampaign re-renders from blocks. Accept either so block-only campaigns
  // aren't falsely rejected.
  const hasBody =
    (Array.isArray(campaign.body_blocks) && campaign.body_blocks.length > 0) ||
    (campaign.body_html ?? "").trim().length > 0;
  if (!campaign.subject.trim() || !hasBody) {
    return Response.json(
      { error: "Subject and body must both be filled before sending." },
      { status: 400 }
    );
  }

  try {
    const result = await sendCampaign(id);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message.includes(`${SYNC_SEND_AUDIENCE_LIMIT}`) ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}
