"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatDate } from "@/lib/utils";
import { ENGAGEMENT_LEVELS, engagementLabel } from "@/lib/engagement";

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

/* A member is classified on FOUR independent axes that answer four different
   questions. They must never collapse into one control:

     subscribe  -- permission. May we send to them at all?
     engagement -- behaviour. Do they read what we send?
     account    -- did they register on the site?
     buyer      -- have they ever paid?

   The old tab row mixed them ("Customers" filtered on lifetime_orders while
   "Archive" filtered on subscriber_status), so two tabs silently answered
   different questions and no combination was reachable. Each axis is now its
   own filter: empty selection means "any", and the axes intersect. */

type View = "members" | "requests";
type SortKey = "member" | "subscribe" | "engagement" | "account" | "buyer" | "activity";
type SortDir = "asc" | "desc";

// Display order, best-to-worst. Also the sort order -- alphabetical would rank
// "inactive" above "low" and read as nonsense.
const SUBSCRIBE_ORDER = ["active", "pending", "never", "unsubscribed"];
// Best-to-worst, and the sort order. Sourced from lib/engagement so the admin
// and the campaign targeting selector cannot disagree about what exists.
const ENGAGEMENT_ORDER: string[] = [...ENGAGEMENT_LEVELS];
const ACCOUNT_ORDER = ["account", "none"];
const BUYER_ORDER = ["customer", "none"];

const ENGAGEMENT_LABEL: Record<string, string> = Object.fromEntries(
  ENGAGEMENT_ORDER.map((v) => [v, engagementLabel(v)])
);
const ACCOUNT_LABEL: Record<string, string> = { account: "registered", none: "no account" };
const BUYER_LABEL: Record<string, string> = { customer: "has bought", none: "never bought" };

/* refresh_audience_tags mirrors the axes into system tags (subscriber:active,
   engaged:high, customer, customer:recent, ...). Those restate what the four
   filters above already say, so showing them as chips is a second, worse copy
   of the same control. Everything else survives: buyer:digital / buyer:physical
   / buyer:repeat describe WHAT was bought (the Buyer axis only knows whether),
   and free-form tags are added by hand and never redundant. */
function isAxisTag(t: string): boolean {
  return (
    t.startsWith("subscriber:") ||
    t.startsWith("engaged:") ||
    t === "customer" ||
    t.startsWith("customer:")
  );
}

function accountAxis(r: AudienceListRow): string {
  return r.user_id ? "account" : "none";
}
function buyerAxis(r: AudienceListRow): string {
  return r.lifetime_orders > 0 ? "customer" : "none";
}
function rankOf(order: string[], value: string): number {
  const i = order.indexOf(value);
  return i === -1 ? order.length : i;
}

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
  const [view, setView] = useState<View>("members");
  const [search, setSearch] = useState("");
  // Defaults to the old "Subscribers" tab so the page opens on the mailable list.
  const [subFilter, setSubFilter] = useState<Set<string>>(new Set(["active"]));
  const [engFilter, setEngFilter] = useState<Set<string>>(new Set());
  const [acctFilter, setAcctFilter] = useState<Set<string>>(new Set());
  const [buyerFilter, setBuyerFilter] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("member");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [busyId, setBusyId] = useState<string | null>(null);

  const pendingRequests = useMemo(
    () => requests.filter((r) => r.status === "pending"),
    [requests]
  );
  const pendingEmails = useMemo(
    () => new Set(pendingRequests.map((r) => r.email.toLowerCase())),
    [pendingRequests]
  );

  // Counts are over the whole audience, not the current filter, so the numbers
  // on each chip stay stable while you narrow down.
  const counts = useMemo(() => {
    const mk = (get: (r: AudienceListRow) => string) => {
      const m = new Map<string, number>();
      for (const r of audience) m.set(get(r), (m.get(get(r)) || 0) + 1);
      return m;
    };
    return {
      sub: mk((r) => r.subscriber_status),
      eng: mk((r) => r.engagement_score),
      acct: mk(accountAxis),
      buyer: mk(buyerAxis),
    };
  }, [audience]);

  const filtered = useMemo(() => {
    let rows = audience;
    if (subFilter.size > 0) rows = rows.filter((r) => subFilter.has(r.subscriber_status));
    if (engFilter.size > 0) rows = rows.filter((r) => engFilter.has(r.engagement_score));
    if (acctFilter.size > 0) rows = rows.filter((r) => acctFilter.has(accountAxis(r)));
    if (buyerFilter.size > 0) rows = rows.filter((r) => buyerFilter.has(buyerAxis(r)));

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(
        (r) => r.email.toLowerCase().includes(q) ||
               (r.display_name || "").toLowerCase().includes(q)
      );
    }
    return rows;
  }, [audience, subFilter, engFilter, acctFilter, buyerFilter, search]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const key = (r: AudienceListRow): string | number => {
      switch (sortKey) {
        case "member": return (r.display_name || r.email).toLowerCase();
        case "subscribe": return rankOf(SUBSCRIBE_ORDER, r.subscriber_status);
        case "engagement": return rankOf(ENGAGEMENT_ORDER, r.engagement_score);
        case "account": return rankOf(ACCOUNT_ORDER, accountAxis(r));
        case "buyer": return r.lifetime_spend || 0;
        case "activity": return Date.parse(r.last_activity_at || r.created_at) || 0;
      }
    };
    return [...filtered].sort((a, b) => {
      const av = key(a);
      const bv = key(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return a.email.localeCompare(b.email); // stable tiebreak
    });
  }, [filtered, sortKey, sortDir]);

  const toggleIn = (
    value: string,
    current: Set<string>,
    set: (s: Set<string>) => void
  ) => {
    const next = new Set(current);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    set(next);
  };

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(k);
      // Names read best A-Z; everything else best-first.
      setSortDir(k === "member" ? "asc" : "desc");
    }
  };

  const clearAll = () => {
    setSubFilter(new Set());
    setEngFilter(new Set());
    setAcctFilter(new Set());
    setBuyerFilter(new Set());
    setSearch("");
  };
  const filterCount =
    subFilter.size + engFilter.size + acctFilter.size + buyerFilter.size;

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

  const activeCount = counts.sub.get("active") || 0;
  const engagedCount = audience.filter(
    (r) => r.subscriber_status === "active" && r.engagement_score === "high"
  ).length;
  const customerCount = counts.buyer.get("customer") || 0;
  const accountCount = counts.acct.get("account") || 0;
  const archiveCount = counts.sub.get("unsubscribed") || 0;

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
          <span className="admin-stats__label">Mailable</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{engagedCount}</span>
          <span className="admin-stats__label">Engaged</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{customerCount}</span>
          <span className="admin-stats__label">Buyers</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{accountCount}</span>
          <span className="admin-stats__label">Accounts</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{archiveCount}</span>
          <span className="admin-stats__label">Archive</span>
        </div>
      </div>

      <div className="admin-tabs">
        <button
          type="button"
          className={`admin-tabs__tab${view === "members" ? " admin-tabs__tab--active" : ""}`}
          onClick={() => setView("members")}
        >
          Members {audience.length}
        </button>
        <button
          type="button"
          className={`admin-tabs__tab${view === "requests" ? " admin-tabs__tab--active" : ""}`}
          onClick={() => setView("requests")}
        >
          Requests {pendingRequests.length}
          {pendingRequests.length > 0 && (
            <span className="admin-tabs__count admin-tabs__count--alert">
              {pendingRequests.length}
            </span>
          )}
        </button>
      </div>

      {view === "members" && (
        <>
          <div className="audience-filters">
            <FilterAxis
              label="Subscribe"
              order={SUBSCRIBE_ORDER}
              counts={counts.sub}
              selected={subFilter}
              onToggle={(v) => toggleIn(v, subFilter, setSubFilter)}
            />
            <FilterAxis
              label="Engagement"
              order={ENGAGEMENT_ORDER}
              counts={counts.eng}
              selected={engFilter}
              labels={ENGAGEMENT_LABEL}
              onToggle={(v) => toggleIn(v, engFilter, setEngFilter)}
            />
            <FilterAxis
              label="Account"
              order={ACCOUNT_ORDER}
              counts={counts.acct}
              selected={acctFilter}
              labels={ACCOUNT_LABEL}
              onToggle={(v) => toggleIn(v, acctFilter, setAcctFilter)}
            />
            <FilterAxis
              label="Buyer"
              order={BUYER_ORDER}
              counts={counts.buyer}
              selected={buyerFilter}
              labels={BUYER_LABEL}
              onToggle={(v) => toggleIn(v, buyerFilter, setBuyerFilter)}
            />
          </div>

          <div className="audience-admin__controls">
            <input
              type="search"
              className="audience-admin__search"
              placeholder="Search email or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="audience-admin__resultbar">
            <span className="audience-admin__resultcount">
              {sorted.length} of {audience.length}
            </span>
            {(filterCount > 0 || search.trim()) && (
              <button type="button" className="audience-filter__clear" onClick={clearAll}>
                Clear filters
              </button>
            )}
          </div>

          {sorted.length === 0 ? (
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
                  <Th label="Member" k="member" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Subscribe" k="subscribe" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Engagement" k="engagement" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Account" k="account" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <Th label="Orders / Spend" k="buyer" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                  <th className="admin-table__th">Tags</th>
                  <Th label="Last activity" k="activity" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
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
                      </td>
                      <td className="admin-table__td">
                        {/* class keys off the raw value (CSS colours are per
                            stored state); the text is the human label. */}
                        <span className={`audience-engagement audience-engagement--${r.engagement_score}`}>
                          {engagementLabel(r.engagement_score)}
                        </span>
                        {r.emails_received > 0 && (
                          <span className="campaign-list-row__pct">
                            {" "}{r.emails_received} sent
                          </span>
                        )}
                      </td>
                      <td className="admin-table__td">
                        {r.user_id ? (
                          <span className="admin-flag">registered</span>
                        ) : (
                          <span className="admin-dash">-</span>
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
                          <span className="admin-dash">-</span>
                        )}
                      </td>
                      <td className="admin-table__td">
                        <RowTags tags={r.tags} />
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

      {view === "requests" && (
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

/* Tags column, axis-mirroring tags stripped so each row shows only what the
   Subscribe / Engagement / Account / Buyer columns don't already say. */
function RowTags({ tags }: { tags: string[] }) {
  const shown = tags.filter((t) => !isAxisTag(t));
  if (shown.length === 0) return <span className="admin-dash">-</span>;
  return (
    <div className="audience-admin__row-tags">
      {shown.slice(0, 4).map((t) => (
        <span key={t} className="audience-tag-pill">{t}</span>
      ))}
      {shown.length > 4 && (
        <span className="audience-tag-pill audience-tag-pill--more">+{shown.length - 4}</span>
      )}
    </div>
  );
}

/* One classification axis. Values with a zero count are hidden unless selected,
   so dead states (engagement "medium" never populates -- the webhook does not
   mirror opens) don't clutter the bar with unreachable filters. */
function FilterAxis({
  label,
  order,
  counts,
  selected,
  labels,
  onToggle,
}: {
  label: string;
  order: string[];
  counts: Map<string, number>;
  selected: Set<string>;
  labels?: Record<string, string>;
  onToggle: (value: string) => void;
}) {
  const shown = order.filter((v) => (counts.get(v) ?? 0) > 0 || selected.has(v));
  if (shown.length === 0) return null;
  return (
    <div className="audience-filter">
      <span className="audience-filter__label">{label}</span>
      <div className="audience-filter__chips">
        {shown.map((v) => (
          <button
            key={v}
            type="button"
            className={`campaign-editor__chip${selected.has(v) ? " campaign-editor__chip--on" : ""}`}
            onClick={() => onToggle(v)}
          >
            {labels?.[v] ?? v} <span style={{ opacity: 0.6 }}>{counts.get(v) ?? 0}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Th({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const on = sortKey === k;
  return (
    <th
      className={`admin-table__th admin-table__th--sortable${on ? ` is-sorted is-${sortDir}` : ""}`}
      onClick={() => onSort(k)}
      aria-sort={on ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      {label}
    </th>
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
                {r.reason || <span className="admin-dash">-</span>}
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
