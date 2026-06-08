// Front-desk ingest pipeline. Shared by the public contact form
// (/api/contact) and the campaign-reply webhook (/api/webhooks/inbound-email).
//
// Flow: insert the message -> triage with Opus -> if it's a positive note or a
// real opportunity, ping Chad's inbox; otherwise it just sits in the admin
// queue and feeds the weekly digest. Triage runs FAIL-CLOSED: any classifier
// error leaves the row queued (triaged=false, triage_error set) and never
// sends a ping. The insert always succeeds even if triage/ping fail.

import { createAdminClient } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/email";
import { triageInboundMessage, type InboundCategory } from "@/lib/triage";

export type InboundChannel = "contact_form" | "campaign_reply";

export interface IngestInput {
  channel: InboundChannel;
  from_email: string;
  from_name?: string | null;
  subject?: string | null;
  body: string;
  raw?: Record<string, unknown>;
  ip?: string | null;
  user_agent?: string | null;
  referer?: string | null;
  source?: string | null;
}

const CHANNEL_LABEL: Record<InboundChannel, string> = {
  contact_form: "Website contact",
  campaign_reply: "Campaign reply",
};

function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pingTo(): string {
  return process.env.INBOUND_PING_TO || "portal@chadlewine.com";
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://chadlewine.com").replace(/\/$/, "");
}

// Best-effort link to a known audience/subscriber row by email, so the admin
// can see who this is. Never fails the ingest.
async function matchSender(
  supabase: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<{ audience_id: string | null; subscriber_id: string | null }> {
  const lower = email.toLowerCase();
  let audience_id: string | null = null;
  let subscriber_id: string | null = null;
  try {
    const { data: aud } = await supabase
      .from("audience")
      .select("id")
      .ilike("email", lower)
      .maybeSingle();
    audience_id = (aud as { id: string } | null)?.id ?? null;
  } catch {
    /* table shape differences are non-fatal */
  }
  try {
    const { data: sub } = await supabase
      .from("subscribers")
      .select("id")
      .ilike("email", lower)
      .maybeSingle();
    subscriber_id = (sub as { id: string } | null)?.id ?? null;
  } catch {
    /* non-fatal */
  }
  return { audience_id, subscriber_id };
}

function buildPingHtml(d: {
  category: InboundCategory;
  tone: string;
  summary: string;
  channel: InboundChannel;
  from_name: string | null;
  from_email: string;
  subject: string | null;
  body: string;
  adminUrl: string;
}): string {
  const label = d.category === "opportunity" ? "Opportunity" : "Positive note";
  const who = d.from_name ? `${esc(d.from_name)} <${esc(d.from_email)}>` : esc(d.from_email);
  const bodyHtml = esc(d.body).replace(/\n/g, "<br>");
  return `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:#0a0a14;color:#e0e0e8;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;">
    <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#8b9cf7;margin:0 0 8px;">${esc(label)} &middot; ${esc(CHANNEL_LABEL[d.channel])}</p>
    <h1 style="font-size:20px;font-weight:600;margin:0 0 6px;color:#e0e0e8;">${who}</h1>
    <p style="font-size:14px;color:#a0a0b0;margin:0 0 4px;">${esc(d.summary)}</p>
    <p style="font-size:12px;color:#808090;margin:0 0 20px;">Tone: ${esc(d.tone) || "-"}</p>
    ${d.subject ? `<p style="font-size:13px;color:#8b9cf7;margin:0 0 8px;">Subject: ${esc(d.subject)}</p>` : ""}
    <div style="font-size:15px;line-height:1.6;color:#e0e0e8;border-left:2px solid rgba(139,156,247,0.4);padding-left:14px;margin:0 0 24px;white-space:normal;">${bodyHtml}</div>
    <a href="${d.adminUrl}" style="display:inline-block;padding:10px 22px;background:#8b9cf7;color:#0a0a14;text-decoration:none;border-radius:4px;font-weight:600;font-size:13px;">Open in admin</a>
    <p style="font-size:11px;color:#606070;margin-top:28px;line-height:1.6;">
      Reply directly to this email to answer ${esc(d.from_name || "them")}. The front desk filtered everything else into your admin inbox; you only get pinged for positive notes and real opportunities.
    </p>
  </div>
</body></html>`.trim();
}

export interface IngestResult {
  id: string;
  triaged: boolean;
  category: InboundCategory | null;
  is_priority: boolean;
  pinged: boolean;
}

export async function ingestInboundMessage(input: IngestInput): Promise<IngestResult> {
  const supabase = createAdminClient();
  const fromName = (input.from_name || "").trim() || null;
  const subject = (input.subject || "").trim() || null;

  const { audience_id, subscriber_id } = await matchSender(supabase, input.from_email);

  const { data: inserted, error: insErr } = await supabase
    .from("inbound_messages")
    .insert({
      channel: input.channel,
      from_email: input.from_email,
      from_name: fromName,
      subject,
      body_text: input.body || "",
      raw: input.raw || {},
      audience_id,
      subscriber_id,
      ip: input.ip || null,
      user_agent: input.user_agent || null,
      referer: input.referer || null,
      source: input.source || null,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    throw new Error(`inbound insert failed: ${insErr?.message || "no row"}`);
  }
  const id = (inserted as { id: string }).id;

  // Triage -- fail closed. Any error queues the message without a ping.
  let triaged = false;
  let category: InboundCategory | null = null;
  let is_priority = false;
  let pinged = false;

  try {
    const t = await triageInboundMessage({
      from_name: fromName,
      from_email: input.from_email,
      subject,
      body: input.body || "",
    });
    triaged = true;
    category = t.category;
    is_priority = t.is_priority;

    await supabase
      .from("inbound_messages")
      .update({
        triaged: true,
        triage_error: null,
        category: t.category,
        tone: t.tone,
        summary: t.summary,
        is_priority: t.is_priority,
      })
      .eq("id", id);

    if (t.is_priority) {
      const adminUrl = `${siteUrl()}/admin/inbox/${id}`;
      const ok = await sendEmail({
        to: pingTo(),
        subject: `${t.category === "opportunity" ? "Opportunity" : "Note"}: ${t.summary || fromName || input.from_email}`,
        replyTo: input.from_email,
        html: buildPingHtml({
          category: t.category,
          tone: t.tone,
          summary: t.summary,
          channel: input.channel,
          from_name: fromName,
          from_email: input.from_email,
          subject,
          body: input.body || "",
          adminUrl,
        }),
      }).catch(() => false);
      if (ok) {
        pinged = true;
        await supabase
          .from("inbound_messages")
          .update({ pinged_at: new Date().toISOString() })
          .eq("id", id);
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[inbound] triage failed, queuing without ping:", msg);
    await supabase
      .from("inbound_messages")
      .update({ triaged: false, triage_error: msg.slice(0, 500) })
      .eq("id", id);
  }

  return { id, triaged, category, is_priority, pinged };
}
