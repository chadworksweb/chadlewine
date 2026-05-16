import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/email";
import { renderTemplateBySlug } from "@/lib/email-blocks";

// 24h post-first-order trigger. Sends one "ode to the fan" email per
// audience. Gated by both FAN_ODE_DRIP_ENABLED=true and the existence
// of a song marked is_current_fan_ode — either off keeps this a
// dry-run that returns the eligible-count without sending.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface EligibleRow {
  id: string;
  email: string;
  first_name: string | null;
}

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${expected}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createAdminClient();
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry_run") === "1";
  const enabled =
    !dryRun && process.env.FAN_ODE_DRIP_ENABLED === "true";

  const { data: song } = await supabase
    .from("songs")
    .select("id, slug, title")
    .eq("is_current_fan_ode", true)
    .maybeSingle();

  // 25h..24h window. Buyers from later than 24h ago haven't waited long
  // enough; earlier than 25h ago and the cron already missed them.
  const now = Date.now();
  const windowEnd = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const windowStart = new Date(now - 25 * 60 * 60 * 1000).toISOString();

  const { data: candidates, error: qErr } = await supabase
    .from("audience")
    .select("id, email, first_name")
    .eq("lifetime_orders", 1)
    .gte("first_purchase_at", windowStart)
    .lte("first_purchase_at", windowEnd)
    .is("fan_ode_drip_sent_at", null)
    .neq("subscriber_status", "unsubscribed");

  if (qErr) {
    return Response.json({ error: qErr.message }, { status: 500 });
  }

  const eligible = (candidates ?? []) as EligibleRow[];

  if (!song || !enabled) {
    return Response.json({
      enabled,
      reason: !song
        ? "no current fan-ode song selected"
        : dryRun
          ? "dry_run requested"
          : "FAN_ODE_DRIP_ENABLED is not true",
      current_song: song ? { slug: song.slug, title: song.title } : null,
      eligible_count: eligible.length,
      eligible_emails: eligible.map((r) => r.email),
    });
  }

  const sent: string[] = [];
  const failed: Array<{ email: string; reason: string }> = [];

  for (const row of eligible) {
    const token = randomBytes(16).toString("hex");
    const { error: tokenErr } = await supabase
      .from("audience")
      .update({
        fan_ode_token: token,
        fan_ode_drip_sent_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .is("fan_ode_drip_sent_at", null);

    // The .is() guard prevents a race where two cron runs both pick up
    // the same row. If the update affects zero rows, another run beat
    // us — skip.
    if (tokenErr) {
      failed.push({ email: row.email, reason: `db: ${tokenErr.message}` });
      continue;
    }

    const rendered = await renderTemplateBySlug("fan-ode", {
      first_name: row.first_name,
      token,
    });
    if (!rendered) {
      failed.push({ email: row.email, reason: "fan-ode template not found" });
      continue;
    }
    const ok = await sendEmail({
      to: row.email,
      subject: rendered.subject,
      html: rendered.html,
    });

    if (ok) {
      sent.push(row.email);
    } else {
      // Resend failed: roll back so the next cron run can retry.
      await supabase
        .from("audience")
        .update({ fan_ode_drip_sent_at: null, fan_ode_token: null })
        .eq("id", row.id);
      failed.push({ email: row.email, reason: "resend send returned false" });
    }
  }

  return Response.json({
    enabled: true,
    current_song: { slug: song.slug, title: song.title },
    eligible_count: eligible.length,
    sent_count: sent.length,
    failed_count: failed.length,
    sent,
    failed,
  });
}
