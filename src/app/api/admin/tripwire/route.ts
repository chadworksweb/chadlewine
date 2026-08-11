import { createAdminClient } from "@/lib/supabase-server";
import { TRIPWIRE_CHECKS } from "@/lib/tripwire/checks";
import { runTripwire } from "@/lib/tripwire/run";

// Admin control surface for Tripwire. GET returns every registered check
// joined to its stored state plus recent history. POST runs a sweep on demand
// (all checks, or one by id). PATCH mutes or unmutes a check.
//
// The /api/admin gate in proxy.ts covers auth; unauthenticated requests here
// return 404 before this file runs.

export const dynamic = "force-dynamic";

const HISTORY_LIMIT = 20;

export async function GET() {
  const supabase = createAdminClient();

  const [{ data: stateRows }, { data: history }] = await Promise.all([
    supabase.from("tripwire_state").select("*"),
    supabase
      .from("tripwire_runs")
      .select("check_id, status, detail, duration_ms, created_at")
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT * TRIPWIRE_CHECKS.length),
  ]);

  const stateById = new Map(
    (stateRows ?? []).map((r) => [r.check_id as string, r]),
  );

  // The registry is the source of truth for which checks exist. A check that
  // has never run still shows up, as "never run" rather than silently absent.
  const checks = TRIPWIRE_CHECKS.map((c) => {
    const state = stateById.get(c.id);
    return {
      id: c.id,
      label: c.label,
      because: c.because,
      status: (state?.status as string) ?? "unknown",
      detail: (state?.detail as string) ?? null,
      since: (state?.since as string) ?? null,
      last_run_at: (state?.last_run_at as string) ?? null,
      consecutive_failures: (state?.consecutive_failures as number) ?? 0,
      last_alert_at: (state?.last_alert_at as string) ?? null,
      muted: (state?.muted as boolean) ?? false,
      history: (history ?? [])
        .filter((h) => h.check_id === c.id)
        .slice(0, HISTORY_LIMIT),
    };
  });

  return Response.json({
    checks,
    summary: {
      total: checks.length,
      failing: checks.filter((c) => c.status === "fail" && !c.muted).length,
      skipped: checks.filter((c) => c.status === "skip").length,
      never_run: checks.filter((c) => c.status === "unknown").length,
    },
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const only = typeof body.check_id === "string" ? body.check_id : undefined;
  const outcomes = await runTripwire(only ? { only } : undefined);
  return Response.json({ ran: outcomes.length, outcomes });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const checkId = typeof body.check_id === "string" ? body.check_id : "";
  const muted = body.muted === true;

  if (!TRIPWIRE_CHECKS.some((c) => c.id === checkId)) {
    return Response.json({ error: "Unknown check" }, { status: 400 });
  }

  const supabase = createAdminClient();
  // Muting must not touch the recorded status. A muted check keeps reporting
  // and keeps its history; it just stops emailing. Upserting a whole row here
  // would overwrite a real failure with a placeholder, so update the existing
  // row when there is one and only insert a placeholder when there is not.
  const { data: existing } = await supabase
    .from("tripwire_state")
    .select("check_id")
    .eq("check_id", checkId)
    .maybeSingle();

  const { error } = existing
    ? await supabase.from("tripwire_state").update({ muted }).eq("check_id", checkId)
    : await supabase
        .from("tripwire_state")
        .insert({ check_id: checkId, muted, status: "skip", detail: "Never run" });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, check_id: checkId, muted });
}
