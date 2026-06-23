"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatDate } from "@/lib/utils";

export interface AudienceListRow {
  id: string;
  email: string;
  display_name: string | null;
  user_id: string | null;
  subscriber_status: string;
  lifetime_orders: number;
  lifetime_spend: number;
  engagement_score: string;
  emails_received: number;
  emails_opened: number;
  emails_clicked: number;
  last_purchase_at: string | null;
  last_activity_at: string | null;
  created_at: string;
  tags: string[];
}

export interface UnsubRequestRow {
  id: string;
  email: string;
  reason: string | null;
  source_page: string | null;
  status: string;
  created_at: string;
}

type Tab = "all" | "subscribers" | "pending" | "customers" | "requests" | "archive";

function fmtMoney(n: number): string {
  if (!n) return "$0";
  return `$${Number(n).toFixed(2)}`;
}

export function AudienceAdmin({
  audience,
  requests,
}: {
  audience: AudienceListRow[];
  requests: UnsubRequestRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("subscribers");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of audience)
      for (const t of r.tags) m.set(t, (m.get(t) || 0) + 1);
    return Array.from(m.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }, [audience]);

  const pendingRequests = useMemo(
    () => requests.filter((r) => r.status === "pending"),
    [requests]
  );
  const pendingEmails = useMemo(
    () => new Set(pendingRequests.map((r) => r.email.toLowerCase())),
    [pendingRequests]
  );

  const filtered = useMemo(() => {
    let rows = audience;
    if (tab === "subscribers") rows = rows.filter((r) => r.subscriber_status === "active");
    else if (tab === "pending") rows = rows.filter((r) => r.subscriber_status === "pending");
    else if (tab === "customers") rows = rows.filter((r) => r.lifetime_orders > 0);
    else if (tab === "archive") rows = rows.filter((r) => r.subscriber_status === "unsubscribed");

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) => r.email.toLowerCase().includes(q) ||
               (r.display_name || "").toLowerCase().includes(q)
      );
    }
    if (tagFilter.size > 0) {
      rows = rows.filter((r) =>
        Array.from(tagFilter).every((t) => r.tags.includes(t))
      );
    }
    return rows;
  }, [audience, tab, search, tagFilter]);

  const toggleTag = (tag: string) => {
    const next = new Set(tagFilter);
    if (next.has(tag)) next.delete(tag);
    else next.add(tag);
    setTagFilter(next);
  };

  const processRequest = async (audienceId: string, requestId: string) => {
    setBusyId(audienceId);
    await fetch(`/api/admin/audience/${audienceId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscriber_status: "unsubscribed",
        request_id: requestId,
      }),
    });
    setBusyId(null);
    router.refresh();
  };
  const dismissRequest = async (id: string) => {
    setBusyId(id);
    await fetch(`/api/admin/unsubscribe-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    });
    setBusyId(null);
    router.refresh();
  };

  const activeCount = audience.filter((r) => r.subscriber_status === "active").length;
  const pendingSubsCount = audience.filter((r) => r.subscriber_status === "pending").length;
  const customerCount = audience.filter((r) => r.lifetime_orders > 0).length;
  const archiveCount = audience.filter((r) => r.subscriber_status === "unsubscribed").length;

  return (
    <div className="admin-page audience-admin">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Audience</h1>
      </div>

      <div className="admin-stats">
        <div className="admin-stats__card">
          <span className="admin-stats__value">{audience.length}</span>
          <span className="admin-stats__label">Total</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{activeCount}</span>
          <span className="admin-stats__label">Subscribers</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{pendingSubsCount}</span>
          <span className="admin-stats__label">Pending</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{customerCount}</span>
          <span className="admin-stats__label">Customers</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{pendingRequests.length}</span>
          <span className="admin-stats__label">Requests</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{archiveCount}</span>
          <span className="admin-stats__label">Archive</span>
        </div>
      </div>

      <div className="admin-tabs">
        {([
          ["subscribers", `Subscribers ${activeCount}`],
          ["pending", `Pending ${pendingSubsCount}`],
          ["customers", `Customers ${customerCount}`],
          ["requests", `Requests ${pendingRequests.length}`],
          ["archive", `Archive ${archiveCount}`],
          ["all", `All ${audience.length}`],
        ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            type="button"
            className={`admin-tabs__tab${tab === t ? " admin-tabs__tab--active" : ""}`}
            onClick={() => setTab(t)}
          >
            {label}
            {t === "requests" && pendingRequests.length > 0 && (
              <span className="admin-tabs__count admin-tabs__count--alert">
                {pendingRequests.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab !== "requests" && (
        <>
          <div className="audience-admin__controls">
            <input
              type="search"
              className="audience-admin__search"
              placeholder="Search email or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="audience-admin__tag-chips">
              {allTags.slice(0, 20).map(({ tag, count }) => (
                <button
                  key={tag}
                  type="button"
                  className={`campaign-editor__chip${tagFilter.has(tag) ? " campaign-editor__chip--on" : ""}`}
                  onClick={() => toggleTag(tag)}
                >
                  {tag} <span style={{ opacity: 0.6 }}>· {count}</span>
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <p
              style={{
                color: "var(--text-tertiary)",
                fontFamily: "var(--font-ui)",
                textAlign: "center",
                padding: "var(--space-xl)",
              }}
            >
              No members match.
            </p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="admin-table__th">Member</th>
                  <th className="admin-table__th">Status</th>
                  <th className="admin-table__th">Orders / Spend</th>
                  <th className="admin-table__th">Engagement</th>
                  <th className="admin-table__th">Tags</th>
                  <th className="admin-table__th">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const flagged = pendingEmails.has(r.email.toLowerCase());
                  return (
                    <tr
                      key={r.id}
                      className={`admin-table__row${flagged ? " admin-table__row--flagged" : ""}`}
                    >
                      <td className="admin-table__td">
                        <Link href={`/admin/audience/${r.id}`} className="admin-table__link">
                          {r.display_name || r.email}
                        </Link>
                        {r.display_name && (
                          <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                            {r.email}
                          </div>
                        )}
                        {flagged && (
                          <span className="admin-flag admin-flag--alert">Wants out</span>
                        )}
                      </td>
                      <td className="admin-table__td">
                        <span className={`admin-status admin-status--${r.subscriber_status === "active" ? "published" : r.subscriber_status === "unsubscribed" ? "draft" : "private"}`}>
                          {r.subscriber_status}
                        </span>
                        {r.user_id && (
                          <span className="admin-flag" style={{ marginLeft: 6 }}>account</span>
                        )}
                      </td>
                      <td className="admin-table__td">
                        {r.lifetime_orders > 0 ? (
                          <>
                            <strong>{r.lifetime_orders}</strong>{" "}
                            <span style={{ color: "var(--text-tertiary)" }}>
                              ({fmtMoney(r.lifetime_spend)})
                            </span>
                          </>
                        ) : (
                          <span className="admin-dash">—</span>
                        )}
                      </td>
                      <td className="admin-table__td">
                        <span className={`audience-engagement audience-engagement--${r.engagement_score}`}>
                          {r.engagement_score}
                        </span>
                        {r.emails_received > 0 && (
                          <span className="campaign-list-row__pct">
                            {" "}{r.emails_received} sent
                          </span>
                        )}
                      </td>
                      <td className="admin-table__td">
                        <div className="audience-admin__row-tags">
                          {r.tags.slice(0, 4).map((t) => (
                            <span key={t} className="audience-tag-pill">{t}</span>
                          ))}
                          {r.tags.length > 4 && (
                            <span className="audience-tag-pill audience-tag-pill--more">+{r.tags.length - 4}</span>
                          )}
                        </div>
                      </td>
                      <td className="admin-table__td admin-table__td--date">
                        {formatDate(r.last_activity_at || r.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}

      {tab === "requests" && (
        <RequestsTable
          rows={pendingRequests}
          audience={audience}
          busyId={busyId}
          onProcess={processRequest}
          onDismiss={dismissRequest}
        />
      )}
    </div>
  );
}

function RequestsTable({
  rows,
  audience,
  busyId,
  onProcess,
  onDismiss,
}: {
  rows: UnsubRequestRow[];
  audience: AudienceListRow[];
  busyId: string | null;
  onProcess: (audienceId: string, requestId: string) => void;
  onDismiss: (requestId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <p
        style={{
          color: "var(--text-tertiary)",
          fontFamily: "var(--font-ui)",
          textAlign: "center",
          padding: "var(--space-xl)",
        }}
      >
        No pending unsubscribe requests.
      </p>
    );
  }
  const byEmail = new Map(audience.map((a) => [a.email.toLowerCase(), a]));
  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th className="admin-table__th">Email</th>
          <th className="admin-table__th">Reason</th>
          <th className="admin-table__th">Matched</th>
          <th className="admin-table__th">Requested</th>
          <th className="admin-table__th">Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const match = byEmail.get(r.email.toLowerCase());
          return (
            <tr key={r.id} className="admin-table__row">
              <td className="admin-table__td">
                {match ? (
                  <Link href={`/admin/audience/${match.id}`} className="admin-table__link">
                    {r.email}
                  </Link>
                ) : (
                  <span className="admin-table__link">{r.email}</span>
                )}
              </td>
              <td className="admin-table__td admin-table__td--prose">
                {r.reason || <span className="admin-dash">—</span>}
              </td>
              <td className="admin-table__td">
                {match ? (
                  <span className={`admin-status admin-status--${match.subscriber_status === "active" ? "published" : "draft"}`}>
                    {match.subscriber_status}
                  </span>
                ) : (
                  <span className="admin-dash">no match</span>
                )}
              </td>
              <td className="admin-table__td admin-table__td--date">
                {formatDate(r.created_at)}
              </td>
              <td className="admin-table__td">
                <div className="admin-actions">
                  {match && match.subscriber_status === "active" && (
                    <button
                      type="button"
                      className="admin-btn admin-btn--primary"
                      disabled={busyId === match.id}
                      onClick={() => onProcess(match.id, r.id)}
                    >
                      Unsubscribe + archive
                    </button>
                  )}
                  <button
                    type="button"
                    className="admin-btn admin-btn--secondary"
                    disabled={busyId === r.id}
                    onClick={() => onDismiss(r.id)}
                  >
                    Dismiss
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
