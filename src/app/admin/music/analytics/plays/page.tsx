"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface PlayRow {
  song_id: string;
  title: string;
  slug: string | null;
  total_plays: number;
  plays_7d: number;
  plays_30d: number;
  avg_seconds: number;
  last_played_at: string | null;
}

function formatAvgSeconds(s: number): string {
  if (!s) return "—";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}

interface Totals {
  total_plays: number;
  plays_7d: number;
  plays_30d: number;
}

function formatLastPlayed(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const days = Math.floor((Date.now() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (days < 1) {
    const hours = Math.floor((Date.now() - d.getTime()) / (60 * 60 * 1000));
    if (hours < 1) return "just now";
    return `${hours}h ago`;
  }
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function SongPlaysAdminPage() {
  const [rows, setRows] = useState<PlayRow[]>([]);
  const [totals, setTotals] = useState<Totals>({ total_plays: 0, plays_7d: 0, plays_30d: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/analytics?view=plays")
      .then((r) => r.json())
      .then((data) => {
        setRows(Array.isArray(data.rows) ? data.rows : []);
        setTotals(data.totals || { total_plays: 0, plays_7d: 0, plays_30d: 0 });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="admin-page">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Song Plays</h1>
        <Link href="/admin/music" className="admin-btn admin-btn--secondary">Back to Music</Link>
      </div>

      <div className="admin-stats">
        <div className="admin-stats__card">
          <span className="admin-stats__value">{totals.total_plays}</span>
          <span className="admin-stats__label">Total Plays</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{totals.plays_30d}</span>
          <span className="admin-stats__label">Last 30 Days</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{totals.plays_7d}</span>
          <span className="admin-stats__label">Last 7 Days</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{rows.length}</span>
          <span className="admin-stats__label">Songs With Plays</span>
        </div>
      </div>

      {rows.length === 0 ? (
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", marginTop: "var(--space-xl)" }}>
          No play events yet. Plays are recorded after 5+ seconds of listening.
        </p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th className="admin-table__th">Song</th>
              <th className="admin-table__th">Total</th>
              <th className="admin-table__th">30d</th>
              <th className="admin-table__th">7d</th>
              <th className="admin-table__th">Avg Play</th>
              <th className="admin-table__th">Last Played</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.song_id} className="admin-table__row">
                <td className="admin-table__td">
                  {r.slug ? (
                    <Link href={`/admin/music/songs/${r.slug}`} className="admin-table__link">
                      {r.title}
                    </Link>
                  ) : (
                    <span style={{ color: "var(--text-tertiary)" }}>{r.title}</span>
                  )}
                </td>
                <td className="admin-table__td">{r.total_plays}</td>
                <td className="admin-table__td">{r.plays_30d}</td>
                <td className="admin-table__td">{r.plays_7d}</td>
                <td className="admin-table__td">{formatAvgSeconds(r.avg_seconds)}</td>
                <td className="admin-table__td admin-table__td--date">{formatLastPlayed(r.last_played_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
