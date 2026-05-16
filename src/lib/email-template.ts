/* Email rendering. Output must survive a wide range of mail clients,
   including the various flavors of Outlook — so we use table-based layout,
   inline styles, and avoid modern CSS that's not universally supported. */

export interface RenderCampaignEmailInput {
  subject: string;
  preheader?: string | null;
  bodyHtml: string;
  unsubscribeUrl: string;
  fromName: string;
  /** Optional postal address footer (CAN-SPAM). Plain string. */
  postalAddress?: string | null;
  /** Optional call-to-action rendered as a bulletproof button after body. */
  cta?: { label: string; url: string } | null;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Strip tags into a reasonable plain-text version with paragraph breaks. */
function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n\n")
    .replace(/<\/h[1-6]\s*>/gi, "\n\n")
    .replace(/<\/li\s*>/gi, "\n")
    .replace(/<li[^>]*>/gi, " - ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function renderCampaignEmail(input: RenderCampaignEmailInput): RenderedEmail {
  const {
    subject,
    preheader,
    bodyHtml,
    unsubscribeUrl,
    fromName,
    postalAddress,
    cta,
  } = input;

  const safePreheader = preheader ? escapeHtml(preheader) : "";
  const safeFrom = escapeHtml(fromName);
  const safeAddress = postalAddress ? escapeHtml(postalAddress) : "";

  // Bulletproof table-as-button — Gmail strips bg+padding from raw <a>,
  // so the cell holds the color and the anchor/span carry the text.
  const ctaHtml =
    cta && cta.label.trim() && cta.url.trim()
      ? `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto 8px;">
                <tr>
                  <td bgcolor="#4060ff" style="background:#4060ff;border-radius:4px;padding:14px 32px;">
                    <a href="${escapeHtml(cta.url)}" style="text-decoration:none;color:#ffffff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-weight:600;font-size:14px;">
                      <span style="color:#ffffff;text-decoration:none;">${escapeHtml(cta.label)}</span>
                    </a>
                  </td>
                </tr>
              </table>`
      : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(subject)}</title>
<style>
  /* Mobile widths and a couple of resets. Most clients ignore <style>,
     so the inline styles below carry the actual rendering. */
  body { margin:0 !important; padding:0 !important; background:#0d0d1a; }
  a { color:#4060ff; text-decoration:underline; }
  img { border:0; line-height:100%; outline:none; text-decoration:none; -ms-interpolation-mode:bicubic; }
  table { border-collapse:collapse !important; }
  .cl-body p { margin: 0 0 1em 0; }
  .cl-body h1, .cl-body h2, .cl-body h3 { line-height: 1.2; margin: 1.2em 0 0.4em 0; }
  .cl-body ul, .cl-body ol { margin: 0 0 1em 1.2em; padding: 0; }
  .cl-body blockquote { margin: 1em 0; padding-left: 12px; border-left: 2px solid #4060ff; color:#444; }
  .cl-body hr { border: 0; border-top: 1px solid #d8d8e0; margin: 1.5em 0; }
  @media (max-width: 620px) {
    .cl-shell { width: 100% !important; max-width: 100% !important; }
    .cl-pad { padding-left: 18px !important; padding-right: 18px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#0d0d1a;color:#1a1a26;font-family:Georgia,'Iowan Old Style','Palatino Linotype',Palatino,serif;">
  <!-- Preheader: pulled into inbox preview but hidden in body. -->
  <div style="display:none;font-size:1px;color:#0d0d1a;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${safePreheader}
    &#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;&#8203;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0d0d1a;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" class="cl-shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td class="cl-pad" align="center" style="padding:28px 32px 8px 32px;background:#ffffff;">
              <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.32em;color:#6c6c80;text-transform:uppercase;">
                ${safeFrom}
              </div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td class="cl-pad cl-body" style="padding:18px 32px 28px 32px;background:#ffffff;color:#1a1a26;font-size:17px;line-height:1.65;">
              ${bodyHtml}${ctaHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td class="cl-pad" style="padding:20px 32px 28px 32px;background:#f4f4f8;border-top:1px solid #e6e6ee;color:#6c6c80;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.55;">
              <p style="margin:0 0 8px 0;">
                You're getting this because you subscribed at <a href="https://chadlewine.com" style="color:#4060ff;">chadlewine.com</a>.
              </p>
              <p style="margin:0 0 8px 0;">
                <a href="${unsubscribeUrl}" style="color:#4060ff;">Unsubscribe</a>
              </p>
              ${
                safeAddress
                  ? `<p style="margin:0;color:#9090a0;">${safeAddress}</p>`
                  : ""
              }
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const ctaText =
    cta && cta.label.trim() && cta.url.trim()
      ? `\n${cta.label}: ${cta.url}\n`
      : "";

  const text = [
    htmlToText(bodyHtml),
    ctaText,
    "—",
    `Unsubscribe: ${unsubscribeUrl}`,
    postalAddress ? `\n${postalAddress}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { html, text };
}
