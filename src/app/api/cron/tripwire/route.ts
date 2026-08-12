import { runTripwire, pruneRuns } from "@/lib/tripwire/run";

// Tripwire sweep. Runs every 15 minutes in prod (deploy/cron/chadlewine.cron).
// Same auth pattern as the other crons: when CRON_SECRET is set, require it.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${expected}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const outcomes = await runTripwire();
  // Cheap enough to run every sweep, and it keeps retention honest without a
  // second cron entry to forget about.
  const pruned = await pruneRuns();

  return Response.json({
    ran: outcomes.length,
    failing: outcomes.filter((o) => o.status === "fail").length,
    alerted: outcomes.filter((o) => o.alerted).length,
    pruned,
    outcomes,
  });
}
