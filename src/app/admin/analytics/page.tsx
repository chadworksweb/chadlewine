"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type Tab = "summary" | "pages" | "observations";

interface DailySummary {
  day: string;
  total_views: number;
  unique_sessions: number;
  audio_plays: number;
  merch_clicks: number;
  share_clicks: number;
  patronage_clicks: number;
}

interface PageRow {
  page_path: string;
  views: number;
  sessions: number;
  avg_time_seconds: number | null;
  avg_scroll_pct: number | null;
}

interface ObservationRow {
  observation_id: string;
  title: string;
  slug: string;
  total_views: number;
  unique_sessions: number;
  avg_time_seconds: number | null;
  avg_scroll_pct: number | null;
  audio_plays: number;
  merch_clicks: number;
  share_clicks: number;
}

interface Counts {
  subscribers: number;
  patrons: number;
  purchases: number;
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>("summary");
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);

  const [daily, setDaily] = useState<DailySummary[]>([]);
  const [totals, setTotals] = useState({ views: 0, sessions: 0, audio_plays: 0, merch_clicks: 0, share_clicks: 0, patronage_clicks: 0 });
  const [pages, setPages] = useState<PageRow[]>([]);
  const [observations, setObservations] = useState<ObservationRow[]>([]);
  const [counts, setCounts] = useState<Counts>({ subscribers: 0, patrons: 0, purchases: 0 });

  const fetchData = useCallback(async () => {
    setLoading(true);

    if (tab === "summary") {
      const [summaryRes, countsRes] = await Promise.all([
        fetch(`/api/admin/analytics?view=summary&days=${days}`),
        fetch("/api/admin/analytics?view=counts"),
      ]);
      if (summaryRes.ok) {
        const d = await summaryRes.json();
        setDaily(d.daily || []);
        setTotals((prev) => d.totals || prev);
      }
      if (countsRes.ok) setCounts(await countsRes.json());
    }

    if (tab === "pages") {
      const res = await fetch(`/api/admin/analytics?view=pages&days=${days}`);
      if (res.ok) { const d = await res.json(); setPages(d.pages || []); }
    }

    if (tab === "observations") {
      const res = await fetch("/api/admin/analytics?view=observations");
      if (res.ok) { const d = await res.json(); setObservations(d.observations || []); }
    }

    setLoading(false);
  }, [tab, days]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- client-side data load on mount
  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Analytics</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            className="obsv-editor__input"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{ width: "auto", fontSize: "var(--text-xs)" }}
          >
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-xl)" }}>
        {(["summary", "pages", "observations"] as Tab[]).map((t) => (
          <button
            key={t}
            className={`admin-btn ${tab === t ? "admin-btn--primary" : "admin-btn--secondary"}`}
            onClick={() => setTab(t)}
            style={{ fontSize: "var(--text-xs)", padding: "4px 12px" }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading && <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p>}

      {/* Summary tab */}
      {!loading && tab === "summary" && (
        <>
          <div className="admin-stats">
            <div className="admin-stats__card">
              <span className="admin-stats__value">{totals.views.toLocaleString()}</span>
              <span className="admin-stats__label">Page Views</span>
            </div>
            <div className="admin-stats__card">
              <span className="admin-stats__value">{totals.sessions.toLocaleString()}</span>
              <span className="admin-stats__label">Sessions</span>
            </div>
            <div className="admin-stats__card">
              <span className="admin-stats__value">{totals.audio_plays}</span>
              <span className="admin-stats__label">Audio Plays</span>
            </div>
            <div className="admin-stats__card">
              <span className="admin-stats__value">{totals.merch_clicks}</span>
              <span className="admin-stats__label">Merch Clicks</span>
            </div>
            <div className="admin-stats__card">
              <span className="admin-stats__value">{totals.share_clicks}</span>
              <span className="admin-stats__label">Shares</span>
            </div>
            <div className="admin-stats__card">
              <span className="admin-stats__value">{totals.patronage_clicks}</span>
              <span className="admin-stats__label">Patronage</span>
            </div>
          </div>

          <div className="admin-stats" style={{ marginTop: "var(--space-lg)" }}>
            <div className="admin-stats__card">
              <span className="admin-stats__value">{counts.subscribers}</span>
              <span className="admin-stats__label">Subscribers</span>
            </div>
            <div className="admin-stats__card">
              <span className="admin-stats__value">{counts.patrons}</span>
              <span className="admin-stats__label">Patrons</span>
            </div>
            <div className="admin-stats__card">
              <span className="admin-stats__value">{counts.purchases}</span>
              <span className="admin-stats__label">Purchases</span>
            </div>
          </div>

          {daily.length > 0 && (
            <table className="admin-table" style={{ marginTop: "var(--space-xl)" }}>
              <thead>
                <tr>
                  <th className="admin-table__th">Day</th>
                  <th className="admin-table__th">Views</th>
                  <th className="admin-table__th">Sessions</th>
                  <th className="admin-table__th">Audio</th>
                  <th className="admin-table__th">Merch</th>
                  <th className="admin-table__th">Shares</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((d) => (
                  <tr key={d.day} className="admin-table__row">
                    <td className="admin-table__td">{new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                    <td className="admin-table__td">{d.total_views}</td>
                    <td className="admin-table__td">{d.unique_sessions}</td>
                    <td className="admin-table__td">{d.audio_plays}</td>
                    <td className="admin-table__td">{d.merch_clicks}</td>
                    <td className="admin-table__td">{d.share_clicks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {/* Pages tab */}
      {!loading && tab === "pages" && (
        <table className="admin-table">
          <thead>
            <tr>
              <th className="admin-table__th">Page</th>
              <th className="admin-table__th">Views</th>
              <th className="admin-table__th">Sessions</th>
              <th className="admin-table__th">Avg Time</th>
              <th className="admin-table__th">Avg Scroll</th>
            </tr>
          </thead>
          <tbody>
            {pages.length === 0 && (
              <tr><td className="admin-table__td admin-table__td--empty" colSpan={5}>No data yet.</td></tr>
            )}
            {pages.map((p) => (
              <tr key={p.page_path} className="admin-table__row">
                <td className="admin-table__td" style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.page_path}
                </td>
                <td className="admin-table__td">{p.views}</td>
                <td className="admin-table__td">{p.sessions}</td>
                <td className="admin-table__td">{p.avg_time_seconds ? `${p.avg_time_seconds}s` : "--"}</td>
                <td className="admin-table__td">{p.avg_scroll_pct ? `${p.avg_scroll_pct}%` : "--"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Observations tab */}
      {!loading && tab === "observations" && (
        <table className="admin-table">
          <thead>
            <tr>
              <th className="admin-table__th">Observation</th>
              <th className="admin-table__th">Views</th>
              <th className="admin-table__th">Sessions</th>
              <th className="admin-table__th">Avg Time</th>
              <th className="admin-table__th">Scroll</th>
              <th className="admin-table__th">Audio</th>
              <th className="admin-table__th">Merch</th>
            </tr>
          </thead>
          <tbody>
            {observations.length === 0 && (
              <tr><td className="admin-table__td admin-table__td--empty" colSpan={7}>No data yet.</td></tr>
            )}
            {observations.map((o) => (
              <tr key={o.observation_id} className="admin-table__row">
                <td className="admin-table__td">
                  <Link href={`/admin/observations/${o.slug || o.observation_id}`} className="admin-table__link">
                    {o.title}
                  </Link>
                </td>
                <td className="admin-table__td">{o.total_views}</td>
                <td className="admin-table__td">{o.unique_sessions}</td>
                <td className="admin-table__td">{o.avg_time_seconds ? `${Math.round(o.avg_time_seconds)}s` : "--"}</td>
                <td className="admin-table__td">{o.avg_scroll_pct ? `${Math.round(o.avg_scroll_pct)}%` : "--"}</td>
                <td className="admin-table__td">{o.audio_plays}</td>
                <td className="admin-table__td">{o.merch_clicks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
