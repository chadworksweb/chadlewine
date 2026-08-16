import Link from "next/link";
import { createAdminClient } from "@/lib/supabase-server";
import { InboxArchiveButton } from "@/components/InboxArchiveButton";

export const dynamic = "force-dynamic";

interface Row {
  id: string;
  channel: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  category: string | null;
  tone: string | null;
  summary: string | null;
  is_priority: boolean;
  triaged: boolean;
  status: string;
  created_at: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  positive_note: "Positive",
  opportunity: "Opportunity",
  favor_ask: "Favor ask",
  criticism: "Criticism",
  hostile: "Hostile",
  spam: "Spam",
  other: "Other",
};

const CHANNEL_LABEL: Record<string, string> = {
  contact_form: "Contact form",
  campaign_reply: "Campaign reply",
};

// Hidden by default -- the noise the front desk exists to keep off the desk.
const NOISE = ["hostile", "spam"];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export default async function AdminInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const showAll = sp.show === "all";
  const archivedView = sp.view === "archived";

  const supabase = createAdminClient();
  let query = supabase
    .from("inbound_messages")
    .select(
      "id, channel, from_email, from_name, subject, category, tone, summary, is_priority, triaged, status, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  // Archive is a plain status flip: the active desk excludes it, the archived
  // view shows only it.
  query = archivedView ? query.eq("status", "archived") : query.neq("status", "archived");

  // Default view hides hostile + spam, but KEEPS untriaged rows (category null
  // = "needs review"), which a bare `not.in` would drop because NULL NOT IN (..)
  // is NULL. "Show all" reveals everything.
  if (!showAll) {
    query = query.or(`category.is.null,category.not.in.(${NOISE.join(",")})`);
  }

  const { data } = await query;
  const rows = (data || []) as Row[];

  // Count what's hidden so the toggles are honest about what they suppress.
  let hiddenCount = 0;
  if (!showAll) {
    let hidden = supabase
      .from("inbound_messages")
      .select("id", { count: "exact", head: true })
      .in("category", NOISE);
    hidden = archivedView ? hidden.eq("status", "archived") : hidden.neq("status", "archived");
    const { count } = await hidden;
    hiddenCount = count || 0;
  }

  let archivedCount = 0;
  if (!archivedView) {
    const { count } = await supabase
      .from("inbound_messages")
      .select("id", { count: "exact", head: true })
      .eq("status", "archived");
    archivedCount = count || 0;
  }

  const qs = (next: Record<string, string | null>) => {
    const params = new URLSearchParams();
    if (showAll) params.set("show", "all");
    if (archivedView) params.set("view", "archived");
    for (const [k, v] of Object.entries(next)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    const s = params.toString();
    return s ? `/admin/inbox?${s}` : "/admin/inbox";
  };

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">
          {archivedView ? "Archived" : "Front desk inbox"} ({rows.length})
        </h1>
      </div>

      <p style={{ marginBottom: "var(--space-lg)", fontSize: "0.9rem", color: "var(--text-tertiary)" }}>
        Campaign replies and website contact, triaged. Positive notes and opportunities also ping
        your email. {" "}
        {showAll ? (
          <Link href={qs({ show: null })} className="admin-table__link">
            Hide hostile &amp; spam
          </Link>
        ) : (
          <Link href={qs({ show: "all" })} className="admin-table__link">
            Show all ({hiddenCount} hidden)
          </Link>
        )}
        {" · "}
        {archivedView ? (
          <Link href={qs({ view: null })} className="admin-table__link">
            Back to the desk
          </Link>
        ) : (
          <Link href={qs({ view: "archived" })} className="admin-table__link">
            Archived ({archivedCount})
          </Link>
        )}
      </p>

      {rows.length === 0 ? (
        <p>{archivedView ? "Nothing archived." : "Nothing here yet."}</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th className="admin-table__th">Received</th>
              <th className="admin-table__th">From</th>
              <th className="admin-table__th">Channel</th>
              <th className="admin-table__th">Category</th>
              <th className="admin-table__th">Summary</th>
              <th className="admin-table__th">Status</th>
              <th className="admin-table__th"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr className="admin-table__row" key={r.id}>
                <td className="admin-table__td" style={{ whiteSpace: "nowrap" }}>{fmtDate(r.created_at)}</td>
                <td className="admin-table__td">
                  <Link href={`/admin/inbox/${r.id}`} className="admin-table__link">
                    {r.from_name || r.from_email}
                  </Link>
                </td>
                <td className="admin-table__td">{CHANNEL_LABEL[r.channel] || r.channel}</td>
                <td className="admin-table__td">
                  {!r.triaged ? (
                    <span style={{ color: "#e0b050" }}>needs review</span>
                  ) : (
                    <span style={{ color: r.is_priority ? "#8b9cf7" : "var(--text-secondary)" }}>
                      {CATEGORY_LABEL[r.category || "other"] || r.category}
                    </span>
                  )}
                </td>
                <td className="admin-table__td" style={{ maxWidth: "32ch" }}>
                  {r.summary || r.subject || "-"}
                </td>
                <td className="admin-table__td">{r.status}</td>
                <td className="admin-table__td" style={{ whiteSpace: "nowrap" }}>
                  <InboxArchiveButton id={r.id} archived={r.status === "archived"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
