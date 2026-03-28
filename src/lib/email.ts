// Homemade email notification pipeline
// Uses Resend API (or SMTP) to send new Observation notifications

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.EMAIL_FROM || "chad@chadlewine.com";
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
