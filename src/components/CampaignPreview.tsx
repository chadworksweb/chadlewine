"use client";

import { useEffect, useMemo, useRef } from "react";

interface CampaignPreviewProps {
  subject: string;
  preheader: string | null;
  bodyHtml: string;
  fromName: string;
  fromEmail: string;
}

/** Calls the same renderer used at send time so the preview reflects the
   actual email HTML. We can't import server-only modules into a client
   component, so we duplicate the simple template here in a stripped-down
   form. If you change the email template in src/lib/email-template.ts,
   sync the visual look here too. */
function renderPreviewHtml(input: {
  subject: string;
  preheader: string | null;
  bodyHtml: string;
  fromName: string;
}): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escape(input.subject)}</title>
<style>
  body { margin:0; padding:0; background:#0d0d1a; }
  .cl-body p { margin: 0 0 1em 0; }
  .cl-body h1, .cl-body h2, .cl-body h3 { line-height: 1.2; margin: 1.2em 0 0.4em 0; }
  .cl-body ul, .cl-body ol { margin: 0 0 1em 1.2em; padding: 0; }
  .cl-body blockquote { margin: 1em 0; padding-left: 12px; border-left: 2px solid #4060ff; color:#444; }
  .cl-body hr { border: 0; border-top: 1px solid #d8d8e0; margin: 1.5em 0; }
  a { color:#4060ff; }
</style></head>
<body style="margin:0;padding:0;background:#0d0d1a;font-family:Georgia,'Iowan Old Style','Palatino Linotype',Palatino,serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0d0d1a;">
    <tr><td align="center" style="padding:32px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td align="center" style="padding:28px 32px 8px 32px;background:#ffffff;">
          <div style="font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:0.32em;color:#6c6c80;text-transform:uppercase;">
            ${escape(input.fromName)}
          </div>
        </td></tr>
        <tr><td class="cl-body" style="padding:18px 32px 28px 32px;background:#ffffff;color:#1a1a26;font-size:17px;line-height:1.65;">
          ${input.bodyHtml}
        </td></tr>
        <tr><td style="padding:20px 32px 28px 32px;background:#f4f4f8;border-top:1px solid #e6e6ee;color:#6c6c80;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.55;">
          <p style="margin:0 0 8px 0;">You're getting this because you subscribed at <a href="https://chadlewine.com" style="color:#4060ff;">chadlewine.com</a>.</p>
          <p style="margin:0 0 8px 0;"><a href="#" style="color:#4060ff;">Unsubscribe</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function CampaignPreview({
  subject,
  preheader,
  bodyHtml,
  fromName,
  fromEmail,
}: CampaignPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const html = useMemo(
    () => renderPreviewHtml({ subject, preheader, bodyHtml, fromName }),
    [subject, preheader, bodyHtml, fromName],
  );

  useEffect(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
  }, [html]);

  return (
    <div className="campaign-preview">
      <div className="campaign-preview__chrome">
        <div className="campaign-preview__chrome-row">
          <span className="campaign-preview__chrome-label">From</span>
          <span className="campaign-preview__chrome-value">
            {fromName} &lt;{fromEmail}&gt;
          </span>
        </div>
        <div className="campaign-preview__chrome-row">
          <span className="campaign-preview__chrome-label">Subject</span>
          <span className="campaign-preview__chrome-value campaign-preview__chrome-value--strong">
            {subject || <em style={{ opacity: 0.5 }}>(no subject)</em>}
          </span>
        </div>
        {preheader && (
          <div className="campaign-preview__chrome-row">
            <span className="campaign-preview__chrome-label">Preview</span>
            <span className="campaign-preview__chrome-value campaign-preview__chrome-value--muted">
              {preheader}
            </span>
          </div>
        )}
      </div>
      <iframe
        ref={iframeRef}
        title="Email preview"
        className="campaign-preview__frame"
      />
    </div>
  );
}
