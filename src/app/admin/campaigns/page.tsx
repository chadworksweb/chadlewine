import Link from "next/link";
import { createAdminClient } from "@/lib/supabase-server";
import { formatDate } from "@/lib/utils";
import { NewCampaignButton } from "@/components/NewCampaignButton";

const TEMPLATE_PREVIEWS = [
  { href: "/admin/email-templates", label: "Email templates" },
  { href: "/admin/email-templates/globals", label: "Header / footer" },
];

export const dynamic = "force-dynamic";

interface CampaignListRow {
  id: string;
  subject: string;
  status: string;
  sent_count: number;
  failed_count: number;
  click_count: number;
  bounce_count: number;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

async function getCampaigns(): Promise<CampaignListRow[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("campaigns")
    .select(
      "id, subject, status, sent_count, failed_count, click_count, bounce_count, sent_at, created_at, updated_at"
    )
    .order("created_at", { ascending: false });
  return (data || []) as CampaignListRow[];
}

function statusToVariant(status: string): string {
  if (status === "sent") return "published";
  if (status === "draft") return "draft";
  if (status === "sending") return "private";
  return "trash";
}

export default async function AdminCampaignsPage() {
  const campaigns = await getCampaigns();

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Campaigns</h1>
        <div className="admin-page__header-actions">
          {TEMPLATE_PREVIEWS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="admin-btn admin-btn--secondary"
            >
              {t.label}
            </Link>
          ))}
          <NewCampaignButton />
        </div>
      </div>

      {campaigns.length === 0 ? (
        <p
          style={{
            color: "var(--text-tertiary)",
            fontFamily: "var(--font-ui)",
            textAlign: "center",
            padding: "var(--space-xl)",
          }}
        >
          No campaigns yet. Click &ldquo;New campaign&rdquo; to start.
        </p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th className="admin-table__th">Subject</th>
              <th className="admin-table__th">Status</th>
              <th className="admin-table__th">Sent / Failed</th>
              <th className="admin-table__th">Clicks</th>
              <th className="admin-table__th">Bounces</th>
              <th className="admin-table__th">Sent at</th>
              <th className="admin-table__th">Created</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} className="admin-table__row">
                <td className="admin-table__td">
                  <Link
                    href={`/admin/campaigns/${c.id}`}
                    className="admin-table__link campaign-list-row__subject"
                  >
                    {c.subject.trim() || "(untitled)"}
                  </Link>
                </td>
                <td className="admin-table__td">
                  <span
                    className={`admin-status admin-status--${statusToVariant(c.status)}`}
                  >
                    {c.status}
                  </span>
                </td>
                <td className="admin-table__td">
                  {c.status === "sent" || c.status === "failed" ? (
                    <span className="campaign-list-row__meta">
                      {c.sent_count} / {c.failed_count}
                    </span>
                  ) : (
                    <span className="admin-dash">—</span>
                  )}
                </td>
                <td className="admin-table__td">
                  {c.sent_count > 0 ? (
                    <span className="campaign-list-row__meta">
                      {c.click_count}
                      <span className="campaign-list-row__pct">
                        {" "}({Math.round((c.click_count / c.sent_count) * 100)}%)
                      </span>
                    </span>
                  ) : (
                    <span className="admin-dash">—</span>
                  )}
                </td>
                <td className="admin-table__td">
                  {c.bounce_count > 0 ? (
                    <span className="campaign-list-row__meta campaign-list-row__meta--alert">
                      {c.bounce_count}
                    </span>
                  ) : (
                    <span className="admin-dash">—</span>
                  )}
                </td>
                <td className="admin-table__td admin-table__td--date">
                  {c.sent_at ? formatDate(c.sent_at) : <span className="admin-dash">—</span>}
                </td>
                <td className="admin-table__td admin-table__td--date">
                  {formatDate(c.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
