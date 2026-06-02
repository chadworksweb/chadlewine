import { getCartRecoveryConfig, runCartRecovery } from "@/lib/cart-recovery";

// Hourly sweep: find cart checkout sessions opened but never paid (older than the
// configured delay) and email the shopper a link to resume their live checkout.
// Gated by site_settings cart_recovery_enabled. Test mode runs as a dry run
// (computes recipients, sends nothing). Schedule lives in vercel.json.
//
// Auth: Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`. Locally,
// CRON_SECRET is unset so the check is skipped.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${expected}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const config = await getCartRecoveryConfig();
  if (!config.enabled) {
    return Response.json({ enabled: false, reason: "cart_recovery_enabled is not true" });
  }

  // Test mode = dry run: surface who would be emailed without sending.
  const summary = await runCartRecovery({ dryRun: config.testMode });
  return Response.json({ enabled: true, testMode: config.testMode, ...summary });
}
