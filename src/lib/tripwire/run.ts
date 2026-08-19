import "server-only";
import { createAdminClient } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/email";
import {
  TRIPWIRE_CHECKS,
  findCheck,
  currentEnvironment,
  type CheckStatus,
  type TripwireCheck,
} from "./checks";

/* The Tripwire runner.

   Executes checks, records every run, and maintains one state row per check.
   Alerting is on TRANSITION, not on state: a check that has been failing for
   a week emails once, on the run where it first broke. Anything else trains
   you to ignore the mail, which is the same as having no alert. */

const ADMIN_INBOX = process.env.ADMIN_NOTIFICATION_EMAIL || "portal@chadlewine.com";
const SITE_URL = (process.env.SITE_URL || "https://chadlewine.com").replace(/\/+$/, "");

// A check must fail this many runs in a row before it emails. One transient
// network blip on a 15-minute cadence should not wake anyone.
const FAILURES_BEFORE_ALERT = 2;

// Re-alert on a check that is still broken, so a long outage does not fall
// out of mind entirely.
const REALERT_AFTER_HOURS = 24;

const RUN_RETENTION_DAYS = 30;

export interface RunOutcome {
  check_id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  duration_ms: number;
  alerted: boolean;
}

interface StateRow {
  check_id: string;
  status: CheckStatus;
  since: string;
  consecutive_failures: number;
  last_alert_at: string | null;
  muted: boolean;
}

async function executeOne(check: TripwireCheck): Promise<{
  status: CheckStatus;
  detail: string;
  duration_ms: number;
}> {
  const started = Date.now();
  try {
    const res = await check.run();
    return { ...res, duration_ms: Date.now() - started };
  } catch (e) {
    // A check that throws is itself a failure. Never let one bad probe abort
    // the sweep and leave the rest of the board stale.
    return {
      status: "fail",
      detail: `Check threw: ${(e as Error).message}`,
      duration_ms: Date.now() - started,
    };
  }
}

function alertHtml(outcomes: RunOutcome[], environment: string): string {
  const rows = outcomes
    .map(
      (o) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;">${o.label}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;color:#b91c1c;">${o.detail}</td>
      </tr>`,
    )
    .join("");
  return `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:640px;">
      <h2 style="margin:0 0 4px;font-size:18px;">Tripwire tripped on ${environment}</h2>
      <p style="margin:0 0 16px;color:#555;font-size:14px;">
        ${outcomes.length} check${outcomes.length === 1 ? "" : "s"} stopped asserting true.
      </p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">${rows}</table>
      <p style="margin:16px 0 0;font-size:13px;">
        <a href="${SITE_URL}/admin/tripwire" style="color:#4f46e5;">Open the Tripwire panel</a>
      </p>
    </div>`;
}

/* Sends a synthetic alert through the real delivery path, so the channel can
   be proven without waiting for something to actually break. An alert route
   nobody has ever seen arrive is indistinguishable from no alerting at all.
   Writes nothing: no runs, no state, no alert timestamps. */
export async function sendTestAlert(): Promise<{ delivered: boolean; to: string }> {
  const environment = currentEnvironment();
  const delivered = await sendEmail({
    to: ADMIN_INBOX,
    subject: `Tripwire: test alert from ${environment}`,
    html: alertHtml(
      [
        {
          check_id: "__test__",
          label: "Test alert (nothing is wrong)",
          status: "fail",
          detail:
            "Sent from the Tripwire panel to prove the alert channel delivers. No check is failing.",
          duration_ms: 0,
          alerted: true,
        },
      ],
      environment,
    ),
  });
  return { delivered, to: ADMIN_INBOX };
}

export async function runTripwire(opts?: { only?: string }): Promise<RunOutcome[]> {
  const supabase = createAdminClient();
  const checks = opts?.only
    ? [findCheck(opts.only)].filter((c): c is TripwireCheck => !!c)
    : TRIPWIRE_CHECKS;

  if (checks.length === 0) return [];

  // Scope everything to this environment. Prod, staging, and local dev all
  // point at the same Supabase, so without this a sweep from localhost
  // overwrites prod's board.
  const environment = currentEnvironment();

  const { data: stateRows } = await supabase
    .from("tripwire_state")
    .select("check_id, status, since, consecutive_failures, last_alert_at, muted")
    .eq("environment", environment);
  const prior = new Map<string, StateRow>(
    ((stateRows ?? []) as StateRow[]).map((r) => [r.check_id, r]),
  );

  const outcomes: RunOutcome[] = [];
  const toAlert: RunOutcome[] = [];
  const now = new Date();
  const nowIso = now.toISOString();

  // Sequential on purpose. Five checks against prod and a CDN; running them
  // in parallel buys a second and costs a clean read of which one was slow.
  for (const check of checks) {
    const res = await executeOne(check);
    const was = prior.get(check.id);

    const consecutive =
      res.status === "fail" ? (was?.consecutive_failures ?? 0) + 1 : 0;
    const statusChanged = was?.status !== res.status;

    const muted = was?.muted ?? false;
    const alertDue =
      res.status === "fail" &&
      !muted &&
      consecutive >= FAILURES_BEFORE_ALERT &&
      (!was?.last_alert_at ||
        now.getTime() - new Date(was.last_alert_at).getTime() >
          REALERT_AFTER_HOURS * 3_600_000);

    const outcome: RunOutcome = {
      check_id: check.id,
      label: check.label,
      status: res.status,
      detail: res.detail,
      duration_ms: res.duration_ms,
      alerted: alertDue,
    };
    outcomes.push(outcome);
    if (alertDue) toAlert.push(outcome);

    await supabase.from("tripwire_runs").insert({
      check_id: check.id,
      status: res.status,
      detail: res.detail,
      duration_ms: res.duration_ms,
      environment,
    });

    await supabase.from("tripwire_state").upsert(
      {
        environment,
        check_id: check.id,
        status: res.status,
        detail: res.detail,
        // Only move `since` when the status actually changed, so the panel can
        // report how long this state has held.
        since: statusChanged || !was ? nowIso : was.since,
        last_run_at: nowIso,
        consecutive_failures: consecutive,
        last_alert_at: alertDue ? nowIso : (was?.last_alert_at ?? null),
        muted,
      },
      { onConflict: "environment,check_id" },
    );
  }

  if (toAlert.length > 0) {
    try {
      await sendEmail({
        to: ADMIN_INBOX,
        subject: `Tripwire (${environment}): ${toAlert.map((o) => o.label).join(", ")}`,
        html: alertHtml(toAlert, environment),
      });
    } catch (e) {
      // Never let a mail failure fail the sweep; the state row is the record.
      console.error("[tripwire] alert email failed", e);
    }
  }

  return outcomes;
}

// Called from the cron after a sweep. Keeps the run log from growing forever.
export async function pruneRuns(): Promise<number> {
  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - RUN_RETENTION_DAYS * 86_400_000).toISOString();
  const { data } = await supabase
    .from("tripwire_runs")
    .delete()
    .lt("created_at", cutoff)
    .select("id");
  return data?.length ?? 0;
}
