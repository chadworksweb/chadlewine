import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase-server";
import { InboxActions } from "@/components/InboxActions";

export const dynamic = "force-dynamic";

interface Message {
  id: string;
  channel: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  body_text: string;
  category: string | null;
  tone: string | null;
  summary: string | null;
  is_priority: boolean;
  triaged: boolean;
  triage_error: string | null;
  pinged_at: string | null;
  status: string;
  source: string | null;
  ip: string | null;
  user_agent: string | null;
  referer: string | null;
  created_at: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  positive_note: "Positive note",
  opportunity: "Opportunity",
  favor_ask: "Favor ask",
  criticism: "Criticism",
  hostile: "Hostile",
  spam: "Spam",
  other: "Other",
};
const CHANNEL_LABEL: Record<string, string> = {
  contact_form: "Website contact form",
  campaign_reply: "Campaign reply",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" });
}

export default async function AdminInboxDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { data } = await supabase.from("inbound_messages").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const m = data as Message;

  const triageValue = !m.triaged
    ? `Needs review${m.triage_error ? ` -- ${m.triage_error}` : ""}`
    : `${CATEGORY_LABEL[m.category || "other"] || m.category}${m.tone ? ` (${m.tone})` : ""}${m.is_priority ? " -- pinged you" : ""}`;

  const meta: Array<[string, React.ReactNode]> = [
    ["Received", fmtDate(m.created_at)],
    ["From", <a key="e" className="admin-table__link" href={`mailto:${m.from_email}`}>{m.from_name ? `${m.from_name} <${m.from_email}>` : m.from_email}</a>],
    ["Channel", CHANNEL_LABEL[m.channel] || m.channel],
    ["Triage", triageValue],
    ["Summary", m.summary || "-"],
    ["Pinged", m.pinged_at ? fmtDate(m.pinged_at) : "no"],
    ["Source", m.source || "-"],
    ["IP", m.ip || "-"],
    ["Referer", m.referer || "-"],
    ["User agent", m.user_agent || "-"],
  ];

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">{m.from_name || m.from_email}</h1>
      </div>
      <p style={{ marginBottom: "var(--space-lg)" }}>
        <Link href="/admin/inbox" className="admin-table__link">&larr; Front desk inbox</Link>
      </p>

      <div style={{ marginBottom: "var(--space-xl)" }}>
        <InboxActions id={m.id} current={m.status} />
      </div>

      <table className="admin-table" style={{ marginBottom: "var(--space-xl)" }}>
        <tbody>
          {meta.map(([label, value]) => (
            <tr className="admin-table__row" key={label}>
              <td className="admin-table__td" style={{ width: "160px", fontWeight: 600 }}>{label}</td>
              <td className="admin-table__td">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {m.subject && (
        <h2 className="admin-page__title" style={{ fontSize: "1.1rem", marginBottom: "var(--space-sm)" }}>
          {m.subject}
        </h2>
      )}
      <h2 className="admin-page__title" style={{ fontSize: "1.1rem" }}>Message</h2>
      <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, marginTop: "var(--space-sm)" }}>
        {m.body_text || "(empty)"}
      </p>

      <p style={{ marginTop: "var(--space-xl)" }}>
        <a className="admin-table__link" href={`mailto:${m.from_email}${m.subject ? `?subject=Re: ${encodeURIComponent(m.subject)}` : ""}`}>
          Reply by email &rarr;
        </a>
      </p>
    </div>
  );
}
