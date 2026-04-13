"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

interface Song {
  id: string;
  title: string;
  slug: string;
  status: string;
  lyrics: string | null;
  streaming_path: string | null;
  release_date: string | null;
  duration_seconds: number | null;
  price: number | null;
  is_single: boolean;
  updated_at: string | null;
}

type SortKey = "title" | "status" | "release_date" | "duration_seconds" | "updated_at";
type SortDir = "asc" | "desc";

export default function AdminSongsPage() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    fetch("/api/admin/songs")
      .then((r) => r.json())
      .then((data: Song[]) => {
        setSongs(data);
        setLoading(false);
      });
  }, []);

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = [...songs].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * dir;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
    return 0;
  });

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ▲" : " ▼";
  }

  function formatDuration(s: number | null) {
    if (!s) return "—";
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  function freshnessColor(dateStr: string | null): string {
    if (!dateStr) return "var(--text-tertiary)";
    const months = (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (months > 12) return "#ff3333";
    if (months > 6) return "#ffbb33";
    return "#33cc55";
  }

  function formatUpdated(dateStr: string | null): string {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  if (loading) return <div className="admin-page"><p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p></div>;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Songs</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <a
            href="/music/songs"
            target="_blank"
            rel="noopener noreferrer"
            className="admin-btn admin-btn--secondary"
          >
            View Songs Page ↗
          </a>
          <Link href="/admin/music/songs/new" className="admin-btn admin-btn--primary">New Song</Link>
        </div>
      </div>

      <div className="admin-stats" style={{ marginBottom: "var(--space-xl)" }}>
        <div className="admin-stats__card"><span className="admin-stats__value">{songs.length}</span><span className="admin-stats__label">Total</span></div>
        <div className="admin-stats__card"><span className="admin-stats__value">{songs.filter(s => s.lyrics).length}</span><span className="admin-stats__label">With Lyrics</span></div>
        <div className="admin-stats__card"><span className="admin-stats__value">{songs.filter(s => s.streaming_path).length}</span><span className="admin-stats__label">Streamable</span></div>
        <div className="admin-stats__card"><span className="admin-stats__value">{songs.filter(s => s.status === "published").length}</span><span className="admin-stats__label">Published</span></div>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th className="admin-table__th admin-table__th--sortable" onClick={() => handleSort("title")}>Title{sortIndicator("title")}</th>
            <th className="admin-table__th">Lyrics</th>
            <th className="admin-table__th admin-table__th--sortable" onClick={() => handleSort("status")}>Status{sortIndicator("status")}</th>
            <th className="admin-table__th admin-table__th--sortable" onClick={() => handleSort("duration_seconds")}>Duration{sortIndicator("duration_seconds")}</th>
            <th className="admin-table__th admin-table__th--sortable" onClick={() => handleSort("release_date")}>Release{sortIndicator("release_date")}</th>
            <th className="admin-table__th admin-table__th--sortable" onClick={() => handleSort("updated_at")}>Last Updated{sortIndicator("updated_at")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr key={s.id} className="admin-table__row">
              <td className="admin-table__td">
                <Link href={`/admin/music/songs/${s.slug || s.id}`} className="admin-table__link">{s.title}</Link>
                {s.is_single && <span style={{ marginLeft: "0.5rem", fontSize: "0.65rem", color: "var(--text-tertiary)", textTransform: "uppercase" }}>single</span>}
              </td>
              <td className="admin-table__td" style={{ textAlign: "center" }}>
                {s.lyrics ? "✓" : ""}
              </td>
              <td className="admin-table__td"><span className={`admin-status admin-status--${s.status}`}>{s.status}</span></td>
              <td className="admin-table__td">{formatDuration(s.duration_seconds)}</td>
              <td className="admin-table__td admin-table__td--date">{s.release_date || "—"}</td>
              <td className="admin-table__td admin-table__td--date" style={{ color: freshnessColor(s.updated_at) }}>{formatUpdated(s.updated_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
