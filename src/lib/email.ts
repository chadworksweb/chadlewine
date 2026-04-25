// Homemade email notification pipeline
// Uses Resend API (or SMTP) to send new Observation notifications

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.EMAIL_FROM || "site@chadlewine.com";
const SITE_URL = "https://chadlewine.com";

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail({ to, subject, html }: SendEmailOptions): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY not set, skipping send to", to);
    return false;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `Chad Lewine <${FROM_EMAIL}>`,
      to: [to],
      subject,
      html,
    }),
  });

  return res.ok;
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

export function buildCartConfirmationHtml(params: {
  items: Array<{
    title: string;
    type: "song" | "album" | "ringtone" | "merch" | "art_original";
    // Digital lines have formatLinks; physical lines have a fulfillmentNote instead.
    formatLinks?: Array<{ format: "mp3" | "flac" | "wav" | "m4r"; url: string }>;
    fulfillmentNote?: string;
  }>;
  recoverUrl: string;
}): string {
  const { items, recoverUrl } = params;

  const ringtonePlatformLabel = (f: "m4r" | "mp3") =>
    f === "m4r" ? "Download for iPhone (M4R)" : "Download for Android (MP3)";

  const typeLabel = (t: string) => (t === "art_original" ? "ART" : t.toUpperCase());

  const hasDigital = items.some((i) => (i.formatLinks?.length ?? 0) > 0);

  const blocks = items
    .map((item) => {
      let body = "";
      if (item.formatLinks && item.formatLinks.length > 0) {
        const multi = item.formatLinks.length > 1;
        body = item.formatLinks
          .map((f) => {
            const label =
              item.type === "ringtone"
                ? ringtonePlatformLabel(f.format as "m4r" | "mp3")
                : multi
                  ? `Download ${f.format.toUpperCase()}`
                  : "Download";
            return `<a href="${f.url}" style="display: inline-block; padding: 10px 20px; margin: 0 6px 6px 0; background: #8b9cf7; color: #0a0a14; text-decoration: none; border-radius: 4px; font-weight: 600; font-size: 13px;">${label}</a>`;
          })
          .join("");
      } else if (item.fulfillmentNote) {
        body = `<p style="font-size: 13px; color: #a0a0b0; margin: 4px 0 0;">${item.fulfillmentNote}</p>`;
      }
      return `
        <div style="padding: 16px 0; border-bottom: 1px solid rgba(255,255,255,0.08);">
          <p style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #8b9cf7; margin: 0 0 4px;">${typeLabel(item.type)}</p>
          <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 10px; color: #e0e0e8;">${item.title}</h2>
          <div>${body}</div>
        </div>
      `;
    })
    .join("");

  const heading = hasDigital ? "Your downloads are ready" : "Order received";
  const intro = hasDigital
    ? "Pick the format you want for each item — links are yours to keep. Bookmark this email or recover anytime."
    : "We'll email you again as your physical items ship.";

  const recoveryLine = hasDigital
    ? `<p style="font-size: 13px; color: #808090; margin-top: 32px; line-height: 1.5;">
      Lost the email? Recover all your downloads at
      <a href="${recoverUrl}" style="color: #8b9cf7;">${recoverUrl}</a>
    </p>`
    : "";

  const inner = `
    <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #8b9cf7; margin-bottom: 8px;">Thank you for your purchase</p>
    <h1 style="font-size: 24px; font-weight: 600; margin: 0 0 16px; color: #e0e0e8;">${heading}</h1>
    <p style="font-size: 16px; color: #a0a0b0; line-height: 1.5; margin: 0 0 24px;">${intro}</p>
    <div style="border-top: 1px solid rgba(255,255,255,0.08);">${blocks}</div>
    ${recoveryLine}
  `;
  return shell(inner, "You received this because you purchased at chadlewine.com");
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
