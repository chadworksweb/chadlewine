"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

interface CuratedEntry {
  id: string;
  type: string;
  title: string;
  artist_name: string;
  slug: string;
  status: string;
  genre: string | null;
  rising_compass_score: number | null;
  display_order: number;
}

export default function AdminCurationPage() {
  const [entries, setEntries] = useState<CuratedEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/admin/curation");
    setEntries(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="admin-page"><p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p></div>;

  const published = entries.filter(e => e.status === "published");
  const typeCount = (t: string) => entries.filter(e => e.type === t).length;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Curation</h1>
        <Link href="/admin/curation/new" className="admin-btn admin-btn--primary">New Entry</Link>
      </div>

      <div className="admin-stats">
        <div className="admin-stats__card"><span className="admin-stats__value">{entries.length}</span><span className="admin-stats__label">Total</span></div>
        <div className="admin-stats__card"><span className="admin-stats__value">{published.length}</span><span className="admin-stats__label">Published</span></div>
        <div className="admin-stats__card"><span className="admin-stats__value">{typeCount("album")}</span><span className="admin-stats__label">Albums</span></div>
        <div className="admin-stats__card"><span className="admin-stats__value">{typeCount("single")}</span><span className="admin-stats__label">Singles</span></div>
        <div className="admin-stats__card"><span className="admin-stats__value">{typeCount("playlist")}</span><span className="admin-stats__label">Playlists</span></div>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th className="admin-table__th">Title</th>
            <th className="admin-table__th">Artist</th>
            <th className="admin-table__th">Type</th>
            <th className="admin-table__th">RC Score</th>
            <th className="admin-table__th">Genre</th>
            <th className="admin-table__th">Status</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="admin-table__row">
              <td className="admin-table__td">
                <Link href={`/admin/curation/${e.slug || e.id}`} className="admin-table__link">{e.title}</Link>
              </td>
              <td className="admin-table__td">{e.artist_name}</td>
              <td className="admin-table__td">{e.type}</td>
              <td className="admin-table__td">{e.rising_compass_score ?? "—"}</td>
              <td className="admin-table__td">{e.genre || "—"}</td>
              <td className="admin-table__td">
                <span className={`admin-status admin-status--${e.status}`}>{e.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
