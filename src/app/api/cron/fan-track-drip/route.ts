import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/email";
import { renderTemplateBySlug } from "@/lib/email-blocks";

// 24h post-first-order trigger. Mints a fan_track grant for the most
// recently published fan_track and emails the recipient the gated URL.
// This is the SOLE automatic grant + invite path -- panel and email
// reveal together at the 24h mark, so a fresh buyer doesn't see the
// gift until the gift is "delivered".
//
// Gated by FAN_TRACK_DRIP_ENABLED=true and the existence of at least
// one published fan_track. Either off keeps this a dry-run that returns
// the eligible-count without minting grants or sending email.
//
// Cron path: /api/cron/fan-track-drip. Schedule lives in vercel.json.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface EligibleRow {
  id: string;
  email: string;
  first_name: string | null;
  unsubscribe_token: string | null;
}

interface CurrentFanTrack {
  id: string;
  slug: string;
  title: string;
}

function generateGrantToken(): string {
  return randomBytes(24)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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
  const enabled = !dryRun && process.env.FAN_TRACK_DRIP_ENABLED === "true";

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://chadlewine.com";

  // The track to grant + link: most recently published fan_track. When
  // there are multiple published tracks the latest one wins; older
  // grants for the same audience aren't touched.
  const { data: trackRow } = await supabase
    .from("fan_tracks")
    .select("id, slug, title")
    .eq("is_published", true)
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const track = (trackRow as CurrentFanTrack | null) ?? null;

  // 25h..24h window. Buyers from later than 24h ago haven't waited long
  // enough; earlier than 25h ago and the cron already missed them.
  const now = Date.now();
  const windowEnd = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const windowStart = new Date(now - 25 * 60 * 60 * 1000).toISOString();

  const { data: candidates, error: qErr } = await supabase
    .from("audience")
    .select("id, email, first_name, unsubscribe_token")
    .eq("lifetime_orders", 1)
    .gte("first_purchase_at", windowStart)
    .lte("first_purchase_at", windowEnd)
    .is("fan_ode_drip_sent_at", null)
    .neq("subscriber_status", "unsubscribed")
    .not("user_id", "is", null);

  if (qErr) {
    return Response.json({ error: qErr.message }, { status: 500 });
  }

  const eligible = (candidates ?? []) as EligibleRow[];

  if (!track || !enabled) {
    return Response.json({
      enabled,
      reason: !track
        ? "no published fan_track"
        : dryRun
          ? "dry_run requested"
          : "FAN_TRACK_DRIP_ENABLED is not true",
      current_track: track ? { slug: track.slug, title: track.title } : null,
      eligible_count: eligible.length,
      eligible_emails: eligible.map((r) => r.email),
    });
  }

  const sent: string[] = [];
  const failed: Array<{ email: string; reason: string }> = [];

  for (const row of eligible) {
    // Race guard: claim the drip slot before doing the slow work.
    // .is(null) filter ensures only one cron run wins the row.
    const { data: claimed, error: claimErr } = await supabase
      .from("audience")
      .update({ fan_ode_drip_sent_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("fan_ode_drip_sent_at", null)
      .select("id");

    if (claimErr || !claimed || claimed.length === 0) {
      // Another run beat us, or update failed.
      if (claimErr) failed.push({ email: row.email, reason: `db: ${claimErr.message}` });
      continue;
    }

    // Mint the grant (idempotent via unique (fan_track_id, audience_id)).
    const token = generateGrantToken();
    const { data: existingGrant } = await supabase
      .from("fan_track_grants")
      .select("id, token")
      .eq("fan_track_id", track.id)
      .eq("audience_id", row.id)
      .maybeSingle();

    const grantToken = existingGrant?.token ?? token;
    if (!existingGrant) {
      const { error: insertErr } = await supabase.from("fan_track_grants").insert({
        fan_track_id: track.id,
        audience_id: row.id,
        token,
        granted_via: "purchase",
        invite_email_sent_at: new Date().toISOString(),
      });
      if (insertErr) {
        // Roll back the drip claim so a future run retries.
        await supabase
          .from("audience")
          .update({ fan_ode_drip_sent_at: null })
          .eq("id", row.id);
        failed.push({ email: row.email, reason: `grant insert: ${insertErr.message}` });
        continue;
      }
      await supabase.rpc("upsert_audience_event", {
        p_audience_id: row.id,
        p_event_type: "fan_track_granted",
        p_metadata: { fan_track_id: track.id, granted_via: "purchase" },
      });
    } else {
      // Mark the invite as sent on the existing grant (idempotency).
      await supabase
        .from("fan_track_grants")
        .update({ invite_email_sent_at: new Date().toISOString() })
        .eq("id", existingGrant.id);
    }

    const trackUrl = `${siteUrl}/${track.slug}?token=${encodeURIComponent(grantToken)}`;
    const unsubscribeUrl = row.unsubscribe_token
      ? `${siteUrl}/unsubscribe?t=${row.unsubscribe_token}`
      : "";

    const rendered = await renderTemplateBySlug("for-my-fans-01", {
      first_name: row.first_name,
      token: grantToken,
      track_url: trackUrl,
      unsubscribe_url: unsubscribeUrl,
    });
    if (!rendered) {
      failed.push({ email: row.email, reason: "for-my-fans-01 template not found" });
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
      // Resend failed: roll back the drip claim so the next cron run can
      // retry. The grant + audience_event stay, because they're harmless
      // (the panel will show; the user just won't get the email until
      // a later run succeeds).
      await supabase
        .from("audience")
        .update({ fan_ode_drip_sent_at: null })
        .eq("id", row.id);
      failed.push({ email: row.email, reason: "resend send returned false" });
    }
  }

  return Response.json({
    enabled: true,
    current_track: { slug: track.slug, title: track.title },
    eligible_count: eligible.length,
    sent_count: sent.length,
    failed_count: failed.length,
    sent,
    failed,
  });
}
