"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

interface Album { id: string; title: string; slug: string; status: string; display_order: number; release_date: string | null; }
interface Track { id: string; album_id: string; title: string; track_number: number; status: string; streaming_path: string | null; lyrics: string | null; }

export default function AdminMusicPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [aRes, tRes] = await Promise.all([fetch("/api/admin/albums"), fetch("/api/admin/tracks")]);
    setAlbums(await aRes.json());
    setTracks(await tRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="admin-page"><p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p></div>;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Music</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/admin/music/albums/new" className="admin-btn admin-btn--primary">New Album</Link>
          <Link href="/admin/music/tracks/new" className="admin-btn admin-btn--secondary">New Track</Link>
        </div>
      </div>

      <div className="admin-stats">
        <div className="admin-stats__card"><span className="admin-stats__value">{albums.length}</span><span className="admin-stats__label">Albums</span></div>
        <div className="admin-stats__card"><span className="admin-stats__value">{tracks.length}</span><span className="admin-stats__label">Tracks</span></div>
        <div className="admin-stats__card"><span className="admin-stats__value">{tracks.filter(t => t.lyrics).length}</span><span className="admin-stats__label">With Lyrics</span></div>
        <div className="admin-stats__card"><span className="admin-stats__value">{tracks.filter(t => t.streaming_path).length}</span><span className="admin-stats__label">Streamable</span></div>
      </div>

      <h2 style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "var(--space-md)" }}>Albums</h2>
      <table className="admin-table">
        <thead><tr><th className="admin-table__th">Title</th><th className="admin-table__th">Tracks</th><th className="admin-table__th">Status</th><th className="admin-table__th">Release</th></tr></thead>
        <tbody>
          {albums.map((a) => (
            <tr key={a.id} className="admin-table__row">
              <td className="admin-table__td"><Link href={`/admin/music/albums/${a.id}`} className="admin-table__link">{a.title}</Link></td>
              <td className="admin-table__td">{tracks.filter(t => t.album_id === a.id).length}</td>
              <td className="admin-table__td"><span className={`admin-status admin-status--${a.status}`}>{a.status}</span></td>
              <td className="admin-table__td admin-table__td--date">{a.release_date || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
