import { drainCampaignQueue } from "@/lib/campaigns";

// Background campaign sender. Runs every minute (vercel.json) and drains
// queued recipients for every campaign in 'sending', paced under Resend's
// 5/sec limit. Each tick claims rows, sends them, and finalizes a campaign
// once its queue empties. Row-level claims keep overlapping ticks from
// double-sending; a tick that crashes mid-flight self-heals next run.
//
// Cron path: /api/cron/campaign-queue. Schedule lives in vercel.json.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  // Same auth pattern as the other crons: when CRON_SECRET is set, require it.
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${expected}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Leave headroom under maxDuration so an in-flight batch always completes.
  const deadline = Date.now() + 55000;
  try {
    const summary = await drainCampaignQueue(deadline);
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}
