import { createAdminClient } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/email";

// Weekly front-desk digest. Everything that did NOT earn an immediate ping
// (i.e. not a positive note or opportunity) is bundled into one email: counts
// by category, plus the handful worth a glance. Hostile and spam are counted
// but never shown -- that's the whole point of the front desk.
//
// Rolling 7-day window, run weekly (vercel.json). Sends only when there's
// something to report. ?dry_run=1 previews the payload without sending.
//
// Cron path: /api/cron/inbound-digest

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Row {
  id: string;
  channel: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  category: string | null;
  tone: string | null;
  summary: string | null;
  triaged: boolean;
  created_at: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  positive_note: "Positive notes",
  opportunity: "Opportunities",
  favor_ask: "Favor asks",
  criticism: "Criticism",
  hostile: "Hostile",
  spam: "Spam",
  other: "Other",
};

// Categories worth showing line items for. Hostile + spam are counted only.
const SHOWN = new Set(["favor_ask", "criticism", "other"]);

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

function buildDigestHtml(rows: Row[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = r.triaged ? r.category || "other" : "needs_review";
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  const countLines = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => {
      const label = key === "needs_review" ? "Needs review (triage failed)" : CATEGORY_LABEL[key] || key;
      return `<tr><td style="padding:4px 16px 4px 0;color:#a0a0b0;font-size:14px;">${esc(label)}</td><td style="padding:4px 0;color:#e0e0e8;font-size:14px;font-weight:600;">${n}</td></tr>`;
    })
    .join("");

  const worth = rows.filter((r) => !r.triaged || SHOWN.has(r.category || ""));
  const adminBase = `${siteUrl()}/admin/inbox`;
  const worthRows = worth.length
    ? worth
        .map((r) => {
          const who = r.from_name ? `${esc(r.from_name)}` : esc(r.from_email);
          const cat = r.triaged ? CATEGORY_LABEL[r.category || "other"] || r.category : "Needs review";
          const summary = esc(r.summary || r.subject || "(no summary)");
          return `
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
              <a href="${adminBase}/${r.id}" style="color:#e0e0e8;text-decoration:none;font-weight:600;font-size:14px;">${who}</a>
              <span style="color:#8b9cf7;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;margin-left:8px;">${esc(cat as string)}</span>
              <div style="color:#a0a0b0;font-size:13px;margin-top:3px;line-height:1.5;">${summary}</div>
            </td>
          </tr>`;
        })
        .join("")
    : `<tr><td style="padding:12px 0;color:#808090;font-size:14px;">Nothing that needs a look -- just the counts above.</td></tr>`;

  return `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:#0a0a14;color:#e0e0e8;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;">
    <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#8b9cf7;margin:0 0 8px;">Front desk &middot; weekly digest</p>
    <h1 style="font-size:22px;font-weight:600;margin:0 0 6px;color:#e0e0e8;">${rows.length} message${rows.length === 1 ? "" : "s"} this week</h1>
    <p style="font-size:13px;color:#808090;margin:0 0 24px;">The good stuff already pinged you. This is everything else.</p>

    <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#8b9cf7;margin:0 0 8px;">By type</p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:28px;">${countLines}</table>

    <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#8b9cf7;margin:0 0 4px;">Worth a look</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:24px;">${worthRows}</table>

    <a href="${adminBase}" style="display:inline-block;padding:10px 22px;background:#8b9cf7;color:#0a0a14;text-decoration:none;border-radius:4px;font-weight:600;font-size:13px;">Open the inbox</a>
    <p style="font-size:11px;color:#606070;margin-top:28px;line-height:1.6;">Hostile messages and spam are counted but not shown. Open the inbox if you ever want to dig.</p>
  </div>
</body></html>`.trim();
}

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const auth = request.headers.get("authorization") || "";
    if (auth !== `Bearer ${expected}`) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dry_run") === "1";

  const supabase = createAdminClient();
  const windowStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Everything that did not earn an immediate ping. Includes triage failures
  // (triaged=false) so they don't get silently lost.
  const { data, error } = await supabase
    .from("inbound_messages")
    .select("id, channel, from_email, from_name, subject, category, tone, summary, triaged, created_at")
    .eq("is_priority", false)
    .gte("created_at", windowStart)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const rows = (data || []) as Row[];

  if (rows.length === 0) {
    return Response.json({ ok: true, sent: false, reason: "no messages in window", count: 0 });
  }

  if (dryRun) {
    return Response.json({ ok: true, sent: false, dry_run: true, count: rows.length });
  }

  const ok = await sendEmail({
    to: pingTo(),
    subject: `Front desk: ${rows.length} message${rows.length === 1 ? "" : "s"} this week`,
    html: buildDigestHtml(rows),
  });

  return Response.json({ ok, sent: ok, count: rows.length });
}
