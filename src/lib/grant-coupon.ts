import { createAdminClient } from "@/lib/supabase-server";
import { sendEmail, buildCouponEmailHtml } from "@/lib/email";

/* Reusable "grant a store coupon to an email" automation.

   One call: resolve-or-create the audience row, mint a member coupon (deduped
   per audience_id + source), email it, and log a `coupon_granted` event.

   Redemption is account-gated by design: the coupon attaches to the audience
   row, and the cart's "Apply your coupon" toggle only surfaces it once that row
   is linked to a signed-in account. A lead's email-only audience row gets
   linked automatically by the `handle_new_auth_user` trigger when they sign up
   with the same email. No Stripe artifacts are created here -- the actual
   discount is computed and applied ad-hoc inside cart-checkout when the member
   toggles the coupon on (10% off all music, or one merch item -- whichever
   saves more). The emitted `code` is a display label, not something typed at
   checkout.

   Repurpose from any funnel by passing a distinct `source` (the DB enforces one
   coupon per audience per source) plus the percent / expiry / email copy. */

export interface GrantStoreCouponOptions {
  email: string;
  /** Stable funnel key, e.g. "inquiry_songwriting". One coupon per email per source. */
  source: string;
  percentOff: number;
  daysValid: number;
  /** Email content. */
  emailSubject: string;
  eyebrow: string;
  headline: string;
  /** Allowed inline HTML (entities like &mdash;); keep it short. */
  intro: string;
  redeemNote: string;
  footerNote: string;
  ctaUrl?: string;
  ctaLabel?: string;
  /** Optional trusted HTML rendered above the coupon (e.g. an inquiry recap). */
  prependHtml?: string;
}

export interface GrantStoreCouponResult {
  code: string;
  expiresAt: Date;
  /** True when an existing, still-valid coupon for this source was re-sent. */
  reused: boolean;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/* 8-char uppercase alphanumeric display label (Stripe Promotion Code style),
   ambiguous characters omitted. Shown in the email; the discount is applied via
   the member toggle, not by typing this. */
function generateCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/* Resolve an audience row by email, creating a minimal one if absent. Unlike
   the subscribe path this does NOT flip marketing opt-in -- filling a form is
   not a newsletter subscription. */
async function resolveAudienceId(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<string> {
  const { data: existing } = await admin
    .from("audience")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (existing) return existing.id;

  const now = new Date().toISOString();
  const { data: inserted, error } = await admin
    .from("audience")
    .insert({ email, first_seen_at: now })
    .select("id")
    .single();
  if (inserted) return inserted.id;

  // Lost an insert race against a concurrent create -- re-read.
  if (error) {
    const { data: raced } = await admin
      .from("audience")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (raced) return raced.id;
    throw new Error(`audience resolve failed: ${error.message}`);
  }
  throw new Error("audience resolve failed");
}

export async function grantStoreCoupon(
  opts: GrantStoreCouponOptions,
): Promise<GrantStoreCouponResult | null> {
  const email = normalizeEmail(opts.email);
  if (!email.includes("@")) return null;

  const admin = createAdminClient();
  const audienceId = await resolveAudienceId(admin, email);

  // Dedup: one coupon per audience per source (DB-enforced). If a still-valid
  // one already exists, re-send that same code instead of erroring.
  const { data: existing } = await admin
    .from("member_coupons")
    .select("code, expires_at")
    .eq("audience_id", audienceId)
    .eq("source", opts.source)
    .maybeSingle();

  let code: string;
  let expiresAt: Date;
  let reused = false;

  if (existing) {
    expiresAt = new Date(existing.expires_at);
    if (expiresAt.getTime() <= Date.now()) {
      // The one-and-only coupon for this source already lapsed; the unique
      // index blocks a fresh row, so there's nothing live to re-send.
      return null;
    }
    code = existing.code;
    reused = true;
  } else {
    expiresAt = new Date(Date.now() + opts.daysValid * 24 * 60 * 60 * 1000);

    // Insert the member coupon. `code` is globally unique; retry on the rare
    // collision against the unique index.
    let allocated: string | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const candidate = generateCode();
      const { error: insErr } = await admin.from("member_coupons").insert({
        audience_id: audienceId,
        source: opts.source,
        code: candidate,
        percent_off: opts.percentOff,
        expires_at: expiresAt.toISOString(),
      });
      if (!insErr) {
        allocated = candidate;
        break;
      }
      // Source clash means this audience already has a coupon for this source
      // (race against a concurrent grant) -- re-read and reuse it.
      if (/audience_id.*source|idx_member_coupons_audience_source/i.test(insErr.message)) {
        const { data: raced } = await admin
          .from("member_coupons")
          .select("code, expires_at")
          .eq("audience_id", audienceId)
          .eq("source", opts.source)
          .maybeSingle();
        if (raced && new Date(raced.expires_at).getTime() > Date.now()) {
          code = raced.code;
          expiresAt = new Date(raced.expires_at);
          reused = true;
          allocated = raced.code;
          break;
        }
        return null;
      }
      if (/duplicate.*code|unique.*code/i.test(insErr.message)) continue; // code clash, retry
      throw new Error(`member_coupons insert failed: ${insErr.message}`);
    }
    if (!allocated) throw new Error("Could not allocate a coupon code.");
    code = allocated;

    if (!reused) {
      await admin
        .rpc("upsert_audience_event", {
          p_audience_id: audienceId,
          p_event_type: "coupon_granted",
          p_metadata: {
            source: opts.source,
            code,
            percent_off: opts.percentOff,
            expires_at: expiresAt.toISOString(),
          },
        })
        .then(undefined, () => {
          /* non-fatal */
        });
    }
  }

  await sendEmail({
    to: email,
    subject: opts.emailSubject,
    html: buildCouponEmailHtml({
      code,
      percentOff: opts.percentOff,
      expiresAt,
      eyebrow: opts.eyebrow,
      headline: opts.headline,
      intro: opts.intro,
      redeemNote: opts.redeemNote,
      footerNote: opts.footerNote,
      ctaUrl: opts.ctaUrl,
      ctaLabel: opts.ctaLabel,
      prependHtml: opts.prependHtml,
    }),
  });

  return { code, expiresAt, reused };
}
