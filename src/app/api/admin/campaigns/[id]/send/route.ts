import { createAdminClient } from "@/lib/supabase-server";
import { enqueueCampaign, kickCampaignWorker } from "@/lib/campaigns";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// "Send" only enqueues -- it locks the campaign and inserts queued rows, then
// returns. Actual delivery runs in the background via the /api/cron/campaign-queue
// worker, so this stays fast regardless of audience size. The insert is chunked
// and finishes well within the default budget even for large lists.
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
    const result = await enqueueCampaign(id);
    // Kick the worker now so delivery starts immediately instead of waiting for
    // the safety-net cron; the worker then self-continues until the queue drains.
    kickCampaignWorker();
    // 202 Accepted: queued, the background worker delivers it.
    return Response.json({ ok: true, ...result }, { status: 202 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // State/limit problems are the operator's to fix -> 409; empty audience
    // -> 400; anything else is a real server error.
    const status =
      /not in draft|exceeds the maximum/.test(message)
        ? 409
        : /No active subscribers/.test(message)
          ? 400
          : 500;
    return Response.json({ error: message }, { status });
  }
}
