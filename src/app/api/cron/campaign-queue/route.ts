import { drainCampaignQueue, kickCampaignWorker, shouldContinueDraining } from "@/lib/campaigns";

// Background campaign sender. Drains queued recipients for every campaign in
// 'sending', paced under Resend's 5/sec limit. Each tick claims rows, sends
// them, and finalizes a campaign once its queue empties. Row-level claims keep
// overlapping ticks from double-sending; a tick that crashes mid-flight
// self-heals next run.
//
// Event-driven, not a busy poll: the Send route kicks this worker on enqueue,
// and each tick self-continues (kickCampaignWorker) while a send is still
// draining -- so the worker runs only while there is something to send. A
// low-frequency safety-net cron (/etc/cron.d/chadlewine, */10) is the sole
// fallback, resuming any campaign left 'sending' if a self-trigger chain died
// (e.g. a container restart mid-send).

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
    // Self-continue: if this tick made progress and a campaign is still
    // draining, immediately trigger the next tick rather than waiting on the
    // safety-net cron. Stops on its own once every campaign finalizes.
    if (shouldContinueDraining(summary)) kickCampaignWorker();
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}
