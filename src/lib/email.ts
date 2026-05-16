// Homemade email notification pipeline
// Uses Resend API (or SMTP) to send new Observation notifications

const SITE_URL = "https://chadlewine.com";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendEmail({ to, subject, html, replyTo }: SendEmailOptions): Promise<boolean> {
  // Read env at call time so this works in scripts that load .env after module import.
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.EMAIL_FROM || "site@chadlewine.com";

  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set, skipping send to", to);
    return false;
  }

  const body: Record<string, unknown> = {
    from: `Chad Lewine <${fromEmail}>`,
    to: [to],
    subject,
    html,
  };
  if (replyTo) body.reply_to = replyTo;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return res.ok;
}

function escapeHtml(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDollars(n: number): string {
  return `$${n.toFixed(2)}`;
}

export interface OrderEmailLine {
  title: string;
  type: "song" | "album" | "ringtone" | "merch" | "art_original";
  quantity: number;
  lineTotal: number;
  variantNote?: string;
  imageUrl?: string;
  formatLinks?: Array<{ format: "mp3" | "flac" | "wav" | "m4r"; url: string }>;
  fulfillmentNote?: string;
}

export interface OrderEmailData {
  orderNumber: string;
  orderId: string;
  buyerEmail: string;
  buyerName: string | null;
  shipping: {
    name: string | null;
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string | null;
  } | null;
  subtotal: number;
  shippingCost: number;
  tax: number;
  total: number;
  items: OrderEmailLine[];
  recoverUrl: string;
}

function shell(innerHtml: string, footerNote: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #0a0a14; color: #e0e0e8; padding: 40px 20px;">
  <div style="max-width: 560px; margin: 0 auto;">
    ${innerHtml}
    <p style="font-size: 11px; color: #606070; margin-top: 40px; line-height: 1.6;">${footerNote}</p>
    <p style="font-size: 11px; color: #606070; margin-top: 12px; line-height: 1.6;">
      Customer support: email <a href="mailto:portal@chadlewine.com" style="color: #8b9cf7;">portal@chadlewine.com</a>
    </p>
  </div>
</body>
</html>`.trim();
}

function renderThumb(url: string | undefined): string {
  // Always render the cell for column alignment; show a placeholder block if
  // no image URL is available (rare — every product type has an image source).
  const inner = url
    ? `<img src="${escapeHtml(url)}" alt="" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:6px;background:#1a1a26;object-fit:cover;" />`
    : `<div style="width:56px;height:56px;border-radius:6px;background:#1a1a26;"></div>`;
  return `<td valign="top" style="padding:14px 12px 14px 0;border-bottom:1px solid rgba(255,255,255,0.08);width:64px;">${inner}</td>`;
}

function renderItemRowsCustomer(items: OrderEmailLine[]): string {
  const ringtonePlatformLabel = (f: "m4r" | "mp3") =>
    f === "m4r" ? "iPhone (M4R)" : "Android (MP3)";

  return items
    .map((item) => {
      let downloads = "";
      if (item.formatLinks && item.formatLinks.length > 0) {
        const multi = item.formatLinks.length > 1;
        downloads = `<div style="margin-top:10px;">${item.formatLinks
          .map((f) => {
            const label =
              item.type === "ringtone"
                ? `Download — ${ringtonePlatformLabel(f.format as "m4r" | "mp3")}`
                : multi
                  ? `Download ${f.format.toUpperCase()}`
                  : "Download";
            return `<a href="${f.url}" style="display:inline-block;padding:8px 16px;margin:0 6px 6px 0;background:#8b9cf7;color:#0a0a14;text-decoration:none;border-radius:4px;font-weight:600;font-size:12px;">${escapeHtml(
              label,
            )}</a>`;
          })
          .join("")}</div>`;
      }

      const note = item.fulfillmentNote
        ? `<div style="margin-top:6px;font-size:12px;color:#808090;">${escapeHtml(item.fulfillmentNote)}</div>`
        : "";

      const variantLine = item.variantNote
        ? `<div style="font-size:12px;color:#808090;margin-top:2px;">${escapeHtml(item.variantNote)}</div>`
        : "";

      return `
        <tr>
          ${renderThumb(item.imageUrl)}
          <td style="padding:14px 0;border-bottom:1px solid rgba(255,255,255,0.08);font-size:14px;color:#e0e0e8;">
            <div style="font-weight:600;">${escapeHtml(item.title)}</div>
            ${variantLine}
            ${downloads}
            ${note}
          </td>
          <td style="padding:14px 0;border-bottom:1px solid rgba(255,255,255,0.08);font-size:14px;color:#a0a0b0;text-align:center;width:60px;">${item.quantity}</td>
          <td style="padding:14px 0;border-bottom:1px solid rgba(255,255,255,0.08);font-size:14px;color:#e0e0e8;text-align:right;width:90px;font-weight:600;">${fmtDollars(item.lineTotal)}</td>
        </tr>`;
    })
    .join("");
}

function renderShippingBlock(shipping: OrderEmailData["shipping"]): string {
  if (!shipping || !shipping.line1) return "";
  const line2 = shipping.line2 ? `${escapeHtml(shipping.line2)}<br>` : "";
  return `
    <div style="margin-top:24px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.08);">
      <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#8b9cf7;margin:0 0 8px;">Ship To</p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#e0e0e8;">
        ${escapeHtml(shipping.name)}<br>
        ${escapeHtml(shipping.line1)}<br>
        ${line2}
        ${escapeHtml(shipping.city)}, ${escapeHtml(shipping.state)} ${escapeHtml(shipping.postal_code)}${shipping.country && shipping.country !== "US" ? `<br>${escapeHtml(shipping.country)}` : ""}
      </p>
    </div>`;
}

function renderTotalsBlock(d: OrderEmailData): string {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:8px;">
      <tr>
        <td style="text-align:right;padding:6px 0;font-size:13px;color:#a0a0b0;">Subtotal</td>
        <td style="text-align:right;padding:6px 0;font-size:13px;color:#e0e0e8;width:90px;">${fmtDollars(d.subtotal)}</td>
      </tr>
      <tr>
        <td style="text-align:right;padding:6px 0;font-size:13px;color:#a0a0b0;">Shipping</td>
        <td style="text-align:right;padding:6px 0;font-size:13px;color:#e0e0e8;">${fmtDollars(d.shippingCost)}</td>
      </tr>
      <tr>
        <td style="text-align:right;padding:6px 0;font-size:13px;color:#a0a0b0;">Tax</td>
        <td style="text-align:right;padding:6px 0;font-size:13px;color:#e0e0e8;">${fmtDollars(d.tax)}</td>
      </tr>
      <tr style="border-top:1px solid rgba(255,255,255,0.16);">
        <td style="text-align:right;padding:10px 0;font-size:15px;font-weight:700;color:#e0e0e8;">Total</td>
        <td style="text-align:right;padding:10px 0;font-size:15px;font-weight:700;color:#e0e0e8;">${fmtDollars(d.total)}</td>
      </tr>
    </table>`;
}

export function buildOrderConfirmationHtml(d: OrderEmailData): string {
  const hasDigital = d.items.some((i) => (i.formatLinks?.length ?? 0) > 0);
  const hasPhysical = d.items.some(
    (i) => i.type === "merch" || i.type === "art_original",
  );

  const heading = hasDigital && !hasPhysical
    ? "Your downloads are ready"
    : "Your order is in";

  const intro = hasDigital
    ? "Pick the format you want for each item — links are yours to keep."
    : "Custom production takes about 1–2 weeks. We'll email you again when it ships.";

  const recoveryLine = hasDigital
    ? `<p style="font-size:12px;color:#808090;margin-top:24px;line-height:1.5;">
        Lost the email? Recover all downloads at
        <a href="${d.recoverUrl}" style="color:#8b9cf7;">${d.recoverUrl}</a>.
      </p>`
    : "";

  const inner = `
    <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#8b9cf7;margin:0 0 8px;">Thank you for your purchase</p>
    <h1 style="font-size:24px;font-weight:600;margin:0 0 8px;color:#e0e0e8;">${heading}</h1>
    <p style="font-size:13px;color:#808090;margin:0 0 8px;">Order ${escapeHtml(d.orderNumber)}</p>
    <p style="font-size:15px;color:#a0a0b0;line-height:1.5;margin:0 0 24px;">${intro}</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:8px;">
      <thead>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.16);">
          <th style="padding:10px 0;width:64px;"></th>
          <th style="text-align:left;padding:10px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#8b9cf7;">Item</th>
          <th style="text-align:center;padding:10px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#8b9cf7;width:60px;">Qty</th>
          <th style="text-align:right;padding:10px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#8b9cf7;width:90px;">Total</th>
        </tr>
      </thead>
      <tbody>${renderItemRowsCustomer(d.items)}</tbody>
    </table>

    ${renderTotalsBlock(d)}
    ${renderShippingBlock(d.shipping)}
    ${recoveryLine}
  `;

  return shell(inner, "You received this because you purchased at chadlewine.com");
}

export function buildAdminOrderNotificationHtml(d: OrderEmailData & {
  hasPhysical: boolean;
  hasDigital: boolean;
}): string {
  const itemRows = d.items
    .map((item) => {
      const variantLine = item.variantNote
        ? `<div style="font-size:12px;color:#808090;margin-top:2px;">${escapeHtml(item.variantNote)}</div>`
        : "";
      const typeLabel = item.type === "art_original" ? "ART" : item.type.toUpperCase();
      return `
        <tr>
          ${renderThumb(item.imageUrl)}
          <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08);font-size:13px;color:#e0e0e8;">
            <div style="font-weight:600;">${escapeHtml(item.title)}</div>
            ${variantLine}
            <div style="font-size:11px;color:#8b9cf7;letter-spacing:0.08em;text-transform:uppercase;margin-top:4px;">${typeLabel}</div>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08);font-size:13px;color:#a0a0b0;text-align:center;width:60px;">${item.quantity}</td>
          <td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.08);font-size:13px;color:#e0e0e8;text-align:right;width:90px;font-weight:600;">${fmtDollars(item.lineTotal)}</td>
        </tr>`;
    })
    .join("");

  const shipBlock = d.shipping && d.shipping.line1
    ? `
      <td width="50%" style="vertical-align:top;padding-left:12px;">
        <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#8b9cf7;margin:0 0 6px;">Ship To</p>
        <div style="font-size:13px;line-height:1.6;color:#e0e0e8;">
          ${escapeHtml(d.shipping.name)}<br>
          ${escapeHtml(d.shipping.line1)}<br>
          ${d.shipping.line2 ? `${escapeHtml(d.shipping.line2)}<br>` : ""}
          ${escapeHtml(d.shipping.city)}, ${escapeHtml(d.shipping.state)} ${escapeHtml(d.shipping.postal_code)}<br>
          ${escapeHtml(d.shipping.country)}
        </div>
      </td>`
    : `<td width="50%" style="vertical-align:top;padding-left:12px;">
        <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#8b9cf7;margin:0 0 6px;">Fulfillment</p>
        <div style="font-size:13px;color:#a0a0b0;">Digital — no shipping</div>
      </td>`;

  const flagsLine = `${d.hasPhysical ? "Physical" : ""}${d.hasPhysical && d.hasDigital ? " + " : ""}${d.hasDigital ? "Digital" : ""}`;

  const inner = `
    <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#8b9cf7;margin:0 0 8px;">New Order</p>
    <h1 style="font-size:24px;font-weight:600;margin:0 0 8px;color:#e0e0e8;">${escapeHtml(d.orderNumber)}</h1>
    <p style="font-size:13px;color:#808090;margin:0 0 24px;">${escapeHtml(flagsLine)} · ${fmtDollars(d.total)} · ${escapeHtml(d.buyerEmail)}</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">
      <tr>
        <td width="50%" style="vertical-align:top;padding-right:12px;">
          <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#8b9cf7;margin:0 0 6px;">Customer</p>
          <div style="font-size:13px;line-height:1.6;color:#e0e0e8;">
            ${escapeHtml(d.buyerName || "—")}<br>
            <a href="mailto:${escapeHtml(d.buyerEmail)}" style="color:#8b9cf7;">${escapeHtml(d.buyerEmail)}</a>
          </div>
        </td>
        ${shipBlock}
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.16);">
          <th style="padding:10px 0;width:64px;"></th>
          <th style="text-align:left;padding:10px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#8b9cf7;">Item</th>
          <th style="text-align:center;padding:10px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#8b9cf7;width:60px;">Qty</th>
          <th style="text-align:right;padding:10px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#8b9cf7;width:90px;">Total</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    ${renderTotalsBlock(d)}
  `;

  return shell(inner, `Order ${d.orderNumber} · chadlewine.com admin notification`);
}

export function buildRecoveryEmailHtml(params: { verifyUrl: string }): string {
  const inner = `
    <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #8b9cf7; margin-bottom: 8px;">Recover your downloads</p>
    <h1 style="font-size: 24px; font-weight: 600; margin: 0 0 16px; color: #e0e0e8;">Confirm it's you</h1>
    <p style="font-size: 16px; color: #a0a0b0; line-height: 1.5; margin: 0 0 24px;">
      Click below to see every download linked to this email. This link expires in 15 minutes.
    </p>
    <a href="${params.verifyUrl}" style="display: inline-block; padding: 12px 28px; background: #8b9cf7; color: #0a0a14; text-decoration: none; border-radius: 4px; font-weight: 600; font-size: 14px;">See my downloads</a>
    <p style="font-size: 13px; color: #808090; margin-top: 32px; line-height: 1.5;">
      If you didn't request this, ignore the email — nothing happens.
    </p>
  `;
  return shell(inner, "You received this because someone requested download recovery at chadlewine.com");
}

export function buildMemberCouponEmailHtml(params: {
  code: string;
  percentOff: number;
  expiresAt: Date;
}): string {
  const expiresText = params.expiresAt.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });
  const shopUrl = `${SITE_URL}/music`;
  const inner = `
    <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.18em; color: #8b9cf7; margin-bottom: 8px;">Coupon claimed</p>
    <h1 style="font-size: 26px; font-weight: 600; margin: 0 0 12px; color: #e0e0e8;">${params.percentOff}% off your next order</h1>
    <p style="font-size: 16px; color: #a0a0b0; line-height: 1.55; margin: 0 0 24px;">
      Thanks for being a member. Use it on all music in your cart, or
      one merch item &mdash; whichever saves more. One use, expires in
      seven days.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 24px;">
      <tr>
        <td style="background: #13131c; border: 1px solid rgba(139,156,247,0.45); border-radius: 6px; padding: 18px 28px; font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 22px; letter-spacing: 0.22em; color: #e0e0e8;">
          ${escapeHtml(params.code)}
        </td>
      </tr>
    </table>
    <p style="font-size: 14px; color: #8b9cf7; margin: 0 0 24px;">Expires ${escapeHtml(expiresText)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td bgcolor="#8b9cf7" style="border-radius: 4px; padding: 12px 28px;">
          <a href="${shopUrl}" style="color: #0a0a14; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
            <span style="color: #0a0a14;">Shop now</span>
          </a>
        </td>
      </tr>
    </table>
    <p style="font-size: 13px; color: #808090; margin-top: 32px; line-height: 1.55;">
      It's saved to your account. Add items to your cart, then toggle on
      "Apply your member coupon" right above the checkout button.
    </p>
  `;
  return shell(inner, "You received this because you claimed a member coupon at chadlewine<span style=\"color:inherit;\">.</span>com");
}

export function buildFanOdeEmailHtml(params: {
  firstName?: string | null;
  token: string;
}): string {
  const greeting = params.firstName && params.firstName.trim()
    ? `${escapeHtml(params.firstName.trim())}, `
    : "";
  const url = `${SITE_URL}/fan-song?token=${encodeURIComponent(params.token)}`;
  const inner = `
    <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.18em; color: #8b9cf7; margin-bottom: 8px;">A gift for you</p>
    <h1 style="font-size: 26px; font-weight: 500; letter-spacing: -0.01em; margin: 0 0 16px; color: #e0e0e8; line-height: 1.2;">An ode to the fan</h1>
    <p style="font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, 'Times New Roman', serif; font-size: 18px; color: #a0a0b0; line-height: 1.65; margin: 0 0 28px;">
      ${greeting}you bought something yesterday &mdash; a real thing from a real
      person. I made you a song. It&rsquo;s yours.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 0 0 32px;">
      <tr>
        <td bgcolor="#8b9cf7" style="background:#8b9cf7;border-radius:4px;padding:14px 32px;">
          <a href="${url}" style="text-decoration:none;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Helvetica Neue',Arial,sans-serif;font-weight:600;font-size:14px;">
            <span style="color:#ffffff;text-decoration:none;">Listen now</span>
          </a>
        </td>
      </tr>
    </table>
    <p style="font-size: 13px; color: #808090; margin: 0 0 8px; line-height: 1.55;">
      This link is yours alone. Save it. The song lives at the link as long as
      it's the current ode.
    </p>
  `;
  return shell(inner, "You received this because you bought something at chadlewine<span style=\"color:inherit;\">.</span>com.");
}

export function buildObservationEmailHtml(observation: {
  title: string;
  slug: string;
  hook_line: string | null;
  citation_summary: string | null;
}): string {
  const url = `${SITE_URL}/observations/${observation.slug}`;
  const preview = observation.hook_line || observation.citation_summary || "";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #0a0a14; color: #e0e0e8; padding: 40px 20px;">
  <div style="max-width: 560px; margin: 0 auto;">
    <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #8b9cf7; margin-bottom: 8px;">New Observation</p>
    <h1 style="font-size: 24px; font-weight: 600; margin: 0 0 16px; color: #e0e0e8;">
      <a href="${url}" style="color: #e0e0e8; text-decoration: none;">${observation.title}</a>
    </h1>
    ${preview ? `<p style="font-size: 16px; color: #a0a0b0; line-height: 1.5; margin: 0 0 24px;">${preview}</p>` : ""}
    <a href="${url}" style="display: inline-block; padding: 10px 24px; background: #8b9cf7; color: #0a0a14; text-decoration: none; border-radius: 4px; font-weight: 600; font-size: 14px;">Read</a>
    <p style="font-size: 11px; color: #606070; margin-top: 40px;">
      You received this because you subscribed at chadlewine.com
    </p>
  </div>
</body>
</html>`.trim();
}
