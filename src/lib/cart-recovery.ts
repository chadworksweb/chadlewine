import { randomBytes } from "crypto";
import { createPublicClient, createAdminClient } from "@/lib/supabase-server";
import { clampInt } from "@/lib/subscribe-modal";
import {
  listRecoverableCartSessions,
  listSessionLineItems,
  createStorePromoCode,
  type RecoverableCartSession,
} from "@/lib/stripe";
import { siteOrigin } from "@/lib/resend";
import { unsubscribeUrl } from "@/lib/campaigns";
import { sendEmail, buildCartRecoveryEmailHtml } from "@/lib/email";

/* Abandoned-cart recovery. A cron (or the admin "preview" button) sweeps Stripe
   for cart checkout sessions a shopper opened but never paid, then emails them a
   link to resume their still-live checkout. Idempotent per Stripe session; honors
   unsubscribe; capped per email. Toggles + delay live in site_settings, mirroring
   the subscribe-modal config. */

export const CART_RECOVERY_KEYS = {
  enabled: "cart_recovery_enabled",
  testMode: "cart_recovery_test_mode",
  delayHours: "cart_recovery_delay_hours",
  discountPercent: "cart_recovery_discount_percent",
} as const;

export const CART_RECOVERY_DELAY = { default: 3, min: 1, max: 23 } as const;
// Recovery incentive. 0 disables the coupon (plain reminder); otherwise a
// single-use Stripe promo code for this percent is minted per recovery email.
export const CART_RECOVERY_DISCOUNT = { default: 15, min: 0, max: 50 } as const;
const COUPON_DAYS = 7;

// How far back to look, and how long to wait before a second email to the same
// person. Lookback must exceed the Stripe open-session lifetime (24h) so we never
// miss one between hourly runs.
const LOOKBACK_HOURS = 26;
const COOLDOWN_DAYS = 7;

export interface CartRecoveryConfig {
  enabled: boolean;
  testMode: boolean;
  delayHours: number;
  discountPercent: number;
}

export async function getCartRecoveryConfig(): Promise<CartRecoveryConfig> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", Object.values(CART_RECOVERY_KEYS));
  const map: Record<string, string> = {};
  for (const row of data || []) map[row.key] = row.value;
  return {
    enabled: map[CART_RECOVERY_KEYS.enabled] === "true",
    testMode: map[CART_RECOVERY_KEYS.testMode] === "true",
    delayHours: clampInt(map[CART_RECOVERY_KEYS.delayHours], CART_RECOVERY_DELAY),
    discountPercent: clampInt(
      map[CART_RECOVERY_KEYS.discountPercent] ?? String(CART_RECOVERY_DISCOUNT.default),
      CART_RECOVERY_DISCOUNT
    ),
  };
}

function genToken(): string {
  return randomBytes(24).toString("hex");
}

// Resume the shopper's actual live session: hosted (digital) sessions have a
// payable Stripe url; embedded (physical) ones resume via our /checkout page.
function resumeUrlFor(s: RecoverableCartSession): string {
  if (s.url) return s.url;
  return `${siteOrigin()}/checkout?recover=${encodeURIComponent(s.sessionId)}`;
}

interface Recipient {
  sessionId: string;
  email: string;
  resumeUrl: string;
  total: number;
  items: Array<{ title: string; quantity: number; lineTotal: number }>;
}

export interface CartRecoverySummary {
  delayHours: number;
  candidates: number;
  eligible: number;
  sent: number;
  failed: number;
  skipped: number;
  recipients: Array<{ email: string; sessionId: string; total: number }>;
}

export async function runCartRecovery(
  opts: { dryRun: boolean }
): Promise<CartRecoverySummary> {
  const config = await getCartRecoveryConfig();
  const supabase = createAdminClient();

  const now = Date.now();
  const untilMs = now - config.delayHours * 60 * 60 * 1000;
  const sinceMs = now - LOOKBACK_HOURS * 60 * 60 * 1000;

  const sessions = await listRecoverableCartSessions({ sinceMs, untilMs });

  let skipped = 0;
  const summary: CartRecoverySummary = {
    delayHours: config.delayHours,
    candidates: sessions.length,
    eligible: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    recipients: [],
  };

  if (sessions.length === 0) return summary;

  const sessionIds = sessions.map((s) => s.sessionId);
  const emails = Array.from(new Set(sessions.map((s) => s.email.toLowerCase())));

  // Bulk look-ups: already-emailed sessions, converted (paid) sessions, and
  // recent recovery sends per email (cooldown).
  const cooldownSince = new Date(now - COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: sentRows }, { data: orderRows }, { data: cooldownRows }] = await Promise.all([
    supabase.from("cart_recovery_emails").select("stripe_session_id").in("stripe_session_id", sessionIds),
    supabase.from("orders").select("stripe_session_id").in("stripe_session_id", sessionIds),
    supabase.from("cart_recovery_emails").select("email").in("email", emails).gte("sent_at", cooldownSince),
  ]);

  const alreadySent = new Set((sentRows || []).map((r) => r.stripe_session_id));
  const converted = new Set((orderRows || []).map((r) => r.stripe_session_id).filter(Boolean));
  const cooledDown = new Set((cooldownRows || []).map((r) => r.email.toLowerCase()));

  for (const s of sessions) {
    const email = s.email.toLowerCase();
    if (alreadySent.has(s.sessionId) || converted.has(s.sessionId) || cooledDown.has(email)) {
      skipped++;
      continue;
    }

    // Read (don't create) the audience row for the unsubscribe check. Row/token
    // creation is deferred to the live send below so a dry run writes nothing.
    const { data: aud } = await supabase
      .from("audience")
      .select("id, subscriber_status, unsubscribed_at, unsubscribe_token")
      .eq("email", email)
      .maybeSingle();

    if (aud && (aud.subscriber_status === "unsubscribed" || aud.unsubscribed_at)) {
      skipped++;
      continue;
    }

    // Build the cart contents for the email body.
    const lineItems = await listSessionLineItems(s.sessionId);
    const items = (lineItems.data || []).map((li) => ({
      title: li.description || "Item",
      quantity: li.quantity || 1,
      lineTotal: (li.amount_total ?? li.amount_subtotal ?? 0) / 100,
    }));
    const total = s.amountTotalCents != null
      ? s.amountTotalCents / 100
      : items.reduce((sum, i) => sum + i.lineTotal, 0);

    const recipient: Recipient = {
      sessionId: s.sessionId,
      email,
      resumeUrl: resumeUrlFor(s),
      total,
      items,
    };

    summary.eligible++;
    summary.recipients.push({ email, sessionId: s.sessionId, total });

    if (opts.dryRun) continue;

    // Live only: ensure an audience row + unsubscribe token for the footer link.
    let audienceId: string | null = aud?.id ?? null;
    let token: string;
    if (aud) {
      token = aud.unsubscribe_token || genToken();
      if (!aud.unsubscribe_token) {
        await supabase.from("audience").update({ unsubscribe_token: token }).eq("id", aud.id);
      }
    } else {
      token = genToken();
      const { data: created } = await supabase
        .from("audience")
        .insert({ email, unsubscribe_token: token })
        .select("id")
        .single();
      audienceId = created?.id ?? null;
    }

    // Claim the session atomically: the unique stripe_session_id guarantees we
    // never email the same cart twice even across overlapping cron runs.
    const { error: claimErr } = await supabase.from("cart_recovery_emails").insert({
      stripe_session_id: s.sessionId,
      email,
      audience_id: audienceId,
      resume_url: recipient.resumeUrl,
      item_count: items.length,
      cart_total: total,
      status: "sent",
    });
    if (claimErr) {
      // Unique violation => another run already claimed it. Not a failure.
      skipped++;
      continue;
    }

    // Mint a single-use Stripe promo code for the incentive (typed at checkout).
    // Best-effort: if it fails, fall back to a plain reminder rather than aborting.
    let couponCode: string | null = null;
    let couponExpiresAt: Date | null = null;
    if (config.discountPercent > 0 && audienceId) {
      try {
        const promo = await createStorePromoCode({
          audienceId,
          percentOff: config.discountPercent,
          daysValid: COUPON_DAYS,
          source: "cart_recovery",
        });
        couponCode = promo.code;
        couponExpiresAt = promo.expiresAt;
        await supabase
          .from("cart_recovery_emails")
          .update({ coupon_code: couponCode, discount_percent: config.discountPercent })
          .eq("stripe_session_id", s.sessionId);
      } catch {
        couponCode = null;
      }
    }

    const html = buildCartRecoveryEmailHtml({
      items,
      total,
      resumeUrl: recipient.resumeUrl,
      unsubscribeUrl: unsubscribeUrl(token),
      couponCode,
      discountPercent: config.discountPercent,
      couponExpiresAt,
    });
    const ok = await sendEmail({
      to: email,
      subject: "You left something in your cart - chadlewine.com",
      html,
      headers: {
        "List-Unsubscribe": `<${unsubscribeUrl(token)}>, <mailto:unsubscribe@chadlewine.com>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    if (ok) {
      summary.sent++;
    } else {
      summary.failed++;
      await supabase
        .from("cart_recovery_emails")
        .update({ status: "failed", error: "resend send returned false" })
        .eq("stripe_session_id", s.sessionId);
    }

    // Stay under Resend's 5 req/sec.
    if (summary.sent % 4 === 0) await new Promise((r) => setTimeout(r, 1100));
  }

  summary.skipped = skipped;
  return summary;
}
