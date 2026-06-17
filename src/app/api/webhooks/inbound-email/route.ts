import { Webhook } from "svix";
import { ingestInboundMessage } from "@/lib/inbound";

/* Resend inbound email webhook -> front desk.

   Set a campaign's reply_to to a controlled receiving address on a Resend
   receiving domain. Resend parses each reply and POSTs it here (svix-signed,
   same scheme as the outbound /api/webhooks/resend handler). We strip the
   quoted reply history, then hand the clean message to the shared ingest
   pipeline (insert -> triage -> maybe ping).

   Verification uses RESEND_INBOUND_WEBHOOK_SECRET (distinct from the outbound
   RESEND_WEBHOOK_SECRET). We verify against the raw text body, then parse. */

export const runtime = "nodejs";

interface InboundPayload {
  type?: string;
  data?: {
    email_id?: string;
    from?: string | { address?: string; email?: string; name?: string | null };
    to?: string | string[] | Array<{ address?: string; email?: string }>;
    subject?: string;
    text?: string;
    html?: string;
    headers?: Record<string, unknown>;
    [k: string]: unknown;
  };
}

// The parsed content of a received email, fetched by id from the Receiving API.
interface ReceivedEmail {
  from?: string;
  to?: string | string[];
  subject?: string | null;
  text?: string | null;
  html?: string | null;
  headers?: Record<string, unknown>;
}

// Resend's email.received webhook is METADATA ONLY -- it carries no body. The
// actual text/html lives behind the Receiving API and must be fetched by id.
// Requires RESEND_API_KEY to have received-email read access (a send-only key
// returns 401). On any failure we return null so the caller falls back to the
// (bodyless) webhook payload rather than dropping the message.
async function fetchReceivedEmail(id: string): Promise<ReceivedEmail | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://api.resend.com/emails/receiving/${id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) {
      console.error(`[inbound webhook] receiving fetch ${id} -> ${res.status}`);
      return null;
    }
    return (await res.json()) as ReceivedEmail;
  } catch (e) {
    console.error("[inbound webhook] receiving fetch failed", e);
    return null;
  }
}

type FromField = string | { address?: string; email?: string; name?: string | null } | undefined;

// "Name <addr@x.com>" | "addr@x.com" | { address, name } -> { email, name }
function parseFrom(from: FromField): { email: string; name: string | null } {
  if (!from) return { email: "", name: null };
  if (typeof from === "object") {
    const email = (from.address || from.email || "").trim();
    const name = (from.name || "").toString().trim() || null;
    return { email, name };
  }
  const s = String(from).trim();
  const m = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) {
    const name = m[1].replace(/^"|"$/g, "").trim() || null;
    return { email: m[2].trim(), name };
  }
  return { email: s, name: null };
}

function firstTo(to: unknown): string | null {
  if (!to) return null;
  if (typeof to === "string") return to;
  if (Array.isArray(to)) {
    const first = to[0];
    if (!first) return null;
    if (typeof first === "string") return first;
    return (first.address || first.email || null) as string | null;
  }
  return null;
}

// Plain-text fallback when only HTML is provided.
function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\s*\/\s*p\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Cut the quoted history off a reply so triage + storage see only what the
// person actually wrote. Conservative: trims at the first recognized quote
// boundary, keeps everything above it.
function stripQuotedReply(text: string): string {
  const lines = text.split(/\r?\n/);
  const boundary = /^\s*(On .+ wrote:|-{2,}\s*Original Message\s*-{2,}|_{5,}|From:\s.+|Sent from my )/i;
  const out: string[] = [];
  let quotedRun = 0;
  for (const line of lines) {
    if (boundary.test(line)) break;
    // A block of consecutive ">" lines is quoted material; stop before it once
    // we already have some content above.
    if (/^\s*>/.test(line)) {
      quotedRun++;
      if (out.some((l) => l.trim()) && quotedRun >= 1) break;
      continue;
    }
    quotedRun = 0;
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() || text.trim();
}

export async function POST(request: Request) {
  const body = await request.text();
  const secret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;

  if (!secret) {
    console.error("[inbound webhook] RESEND_INBOUND_WEBHOOK_SECRET not set");
    return Response.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return Response.json({ error: "Missing Svix headers" }, { status: 400 });
  }

  let event: InboundPayload;
  try {
    const wh = new Webhook(secret);
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as InboundPayload;
  } catch (e) {
    console.error("[inbound webhook] signature verification failed", e);
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const data = event.data || {};

  // The webhook is metadata-only; pull the actual body + parsed headers by id.
  // Falls back to the webhook payload if the fetch is unavailable (e.g. a
  // send-only key) so we still record the message, just without its body.
  const emailId = typeof data.email_id === "string" ? data.email_id : null;
  const content = emailId ? await fetchReceivedEmail(emailId) : null;

  const { email, name } = parseFrom((content?.from ?? data.from) as FromField);
  if (!email) {
    // Nothing to attribute -- acknowledge so Resend doesn't retry forever.
    return Response.json({ ok: true, skipped: "no from address" });
  }

  const text = content?.text ?? (typeof data.text === "string" ? data.text : null);
  const html = content?.html ?? (typeof data.html === "string" ? data.html : null);
  const rawText =
    text && text.trim() ? text : html ? htmlToText(html) : "";
  const cleaned = stripQuotedReply(rawText);

  const subject =
    (content?.subject ?? (typeof data.subject === "string" ? data.subject : null)) || null;
  const to = content?.to ?? data.to;

  try {
    await ingestInboundMessage({
      channel: "campaign_reply",
      from_email: email,
      from_name: name,
      subject,
      body: cleaned,
      raw: { event, content } as unknown as Record<string, unknown>,
      source: firstTo(to) || "campaign_reply",
    });
  } catch (e) {
    console.error("[inbound webhook] ingest failed", e);
    // 500 lets Resend retry the delivery.
    return Response.json({ error: "ingest failed" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
