import { sendEmail } from "@/lib/email";

/* Admin notifications for audience-side events.
   Fires async/fire-and-forget so auth + checkout paths aren't slowed down
   if Resend hiccups. Failures are logged but never throw.

   Triggers:
   - notifyNewMember        — first time an email enters audience
   - notifyTierChange       — member crosses a meaningful threshold
                              (first purchase, repeat, account claim,
                              unsubscribe, resubscribe). */

const ADMIN_INBOX = process.env.ADMIN_NOTIFICATION_EMAIL || "portal@chadlewine.com";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://chadlewine.com";

export type MemberTier =
  | "subscriber"
  | "subscriber+account"
  | "customer"
  | "customer+account"
  | "repeat-customer"
  | "unsubscribed";

interface MemberContext {
  audience_id: string;
  email: string;
  display_name?: string | null;
  tier: MemberTier;
  source?: string | null;     // 'subscribe' | 'purchase' | 'account' | 'manual'
  lifetime_orders?: number;
  lifetime_spend?: number;
}

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function tierLabel(tier: MemberTier): string {
  switch (tier) {
    case "subscriber": return "Subscriber";
    case "subscriber+account": return "Subscriber (account)";
    case "customer": return "Customer";
    case "customer+account": return "Customer (account)";
    case "repeat-customer": return "Repeat customer";
    case "unsubscribed": return "Unsubscribed";
  }
}

function shell(headingEyebrow: string, headingTitle: string, body: string): string {
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a14;color:#e0e0e8;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;">
    <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#8b9cf7;margin:0 0 8px;">${escapeHtml(headingEyebrow)}</p>
    <h1 style="font-size:22px;font-weight:600;margin:0 0 16px;color:#e0e0e8;">${escapeHtml(headingTitle)}</h1>
    ${body}
    <p style="font-size:11px;color:#606070;margin-top:32px;">
      Manage in admin: <a href="${SITE_URL}/admin/audience" style="color:#8b9cf7;">${SITE_URL}/admin/audience</a>
    </p>
  </div>
</body></html>`.trim();
}

function memberCard(ctx: MemberContext): string {
  const parts: string[] = [
    `<p style="margin:0 0 8px;font-size:14px;color:#a0a0b0;">
       <strong style="color:#e0e0e8;">${escapeHtml(ctx.email)}</strong>${ctx.display_name ? ` — ${escapeHtml(ctx.display_name)}` : ""}
     </p>`,
    `<p style="margin:0 0 6px;font-size:13px;color:#a0a0b0;">Level: <strong style="color:#e0e0e8;">${escapeHtml(tierLabel(ctx.tier))}</strong></p>`,
  ];
  if (ctx.source) {
    parts.push(`<p style="margin:0 0 6px;font-size:13px;color:#a0a0b0;">Source: ${escapeHtml(ctx.source)}</p>`);
  }
  if (ctx.lifetime_orders !== undefined && ctx.lifetime_orders > 0) {
    parts.push(`<p style="margin:0 0 6px;font-size:13px;color:#a0a0b0;">
      ${ctx.lifetime_orders} order${ctx.lifetime_orders === 1 ? "" : "s"}${ctx.lifetime_spend ? ` &middot; $${Number(ctx.lifetime_spend).toFixed(2)} lifetime` : ""}
    </p>`);
  }
  parts.push(`<p style="margin:14px 0 0;">
    <a href="${SITE_URL}/admin/audience/${ctx.audience_id}" style="display:inline-block;padding:8px 16px;background:#8b9cf7;color:#0a0a14;text-decoration:none;border-radius:4px;font-weight:600;font-size:13px;">Open member</a>
  </p>`);
  return parts.join("\n");
}

export async function notifyNewMember(ctx: MemberContext): Promise<void> {
  try {
    await sendEmail({
      to: ADMIN_INBOX,
      subject: `New member: ${ctx.email} (${tierLabel(ctx.tier)})`,
      html: shell("New audience member", "New member joined", memberCard(ctx)),
    });
  } catch (e) {
    console.error("[audience-notify] notifyNewMember failed", e);
  }
}

export async function notifyTierChange(
  ctx: MemberContext,
  previousTier: MemberTier
): Promise<void> {
  if (previousTier === ctx.tier) return; // safety — no-op if no actual change
  // No admin notification when a member unsubscribes (per preference). Covers
  // the token-unsubscribe path and the bounce/complaint auto-unsubscribe.
  // Resubscribes and tier-ups still notify.
  if (ctx.tier === "unsubscribed") return;
  try {
    await sendEmail({
      to: ADMIN_INBOX,
      subject: `Member changed: ${ctx.email} → ${tierLabel(ctx.tier)}`,
      html: shell(
        "Audience level change",
        `${tierLabel(previousTier)} → ${tierLabel(ctx.tier)}`,
        memberCard(ctx)
      ),
    });
  } catch (e) {
    console.error("[audience-notify] notifyTierChange failed", e);
  }
}

/** Compute a member's tier from raw audience-row fields. */
export function deriveTier(opts: {
  subscriber_status: string;
  user_id?: string | null;
  lifetime_orders: number;
}): MemberTier {
  if (opts.subscriber_status === "unsubscribed") return "unsubscribed";
  if (opts.lifetime_orders >= 2) return "repeat-customer";
  if (opts.lifetime_orders >= 1) {
    return opts.user_id ? "customer+account" : "customer";
  }
  return opts.user_id ? "subscriber+account" : "subscriber";
}
