"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

interface Album { id: string; title: string; slug: string; status: string; display_order: number; release_date: string | null; }
interface Song { id: string; title: string; status: string; streaming_path: string | null; lyrics: string | null; album_id?: string; }
interface FeaturedSong { id: string; title: string; slug: string; }

export default function AdminMusicPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [albumSongCounts, setAlbumSongCounts] = useState<Record<string, number>>({});
  const [featured, setFeatured] = useState<FeaturedSong | null>(null);
  const [settingFeatured, setSettingFeatured] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const [aRes, sRes, fRes] = await Promise.all([
      fetch("/api/admin/albums"),
      fetch("/api/admin/songs"),
      fetch("/api/admin/featured-track"),
    ]);
    const albumsData = await aRes.json();
    const songsData = await sRes.json();
    const featuredData = await fRes.json();
    setAlbums(albumsData);
    setSongs(songsData);
    setFeatured(featuredData);

    // Get song counts per album
    const counts: Record<string, number> = {};
    for (const album of albumsData) {
      const res = await fetch(`/api/admin/songs?album_id=${album.id}`);
      const albumSongs = await res.json();
      counts[album.id] = albumSongs.length;
    }
    setAlbumSongCounts(counts);
    setLoading(false);
  }, []);

  async function handleSetFeatured(songId: string) {
    setSettingFeatured(true);
    const res = await fetch("/api/admin/featured-track", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ song_id: songId }),
    });
    const data = await res.json();
    if (!data.error) setFeatured(data);
    setSettingFeatured(false);
  }

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <div className="admin-page"><p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p></div>;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Music</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/admin/music/albums/new" className="admin-btn admin-btn--primary">New Album</Link>
          <Link href="/admin/music/songs/new" className="admin-btn admin-btn--secondary">New Song</Link>
        </div>
      </div>

      <div className="admin-stats">
        <div className="admin-stats__card"><span className="admin-stats__value">{albums.length}</span><span className="admin-stats__label">Albums</span></div>
        <div className="admin-stats__card"><span className="admin-stats__value">{songs.length}</span><span className="admin-stats__label">Songs</span></div>
        <div className="admin-stats__card"><span className="admin-stats__value">{songs.filter(s => s.lyrics).length}</span><span className="admin-stats__label">With Lyrics</span></div>
        <div className="admin-stats__card"><span className="admin-stats__value">{songs.filter(s => s.streaming_path).length}</span><span className="admin-stats__label">Streamable</span></div>
      </div>

      <div style={{ marginBottom: "var(--space-xl)", padding: "var(--space-lg)", background: "var(--bg-glass)", border: "1px solid var(--bg-glass-border)", borderRadius: 8 }}>
        <h2 style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "var(--space-md)" }}>Featured Track (Homepage)</h2>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
          <select
            value={featured?.id || ""}
            onChange={(e) => e.target.value && handleSetFeatured(e.target.value)}
            disabled={settingFeatured}
            style={{ flex: 1, padding: "8px 12px", background: "var(--bg-elevated)", color: "var(--text-primary)", border: "1px solid var(--border-medium)", borderRadius: 6, fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)" }}
          >
            <option value="">None</option>
            {songs.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
          {featured && (
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-accent)", whiteSpace: "nowrap" }}>
              {settingFeatured ? "Saving..." : `Current: ${featured.title}`}
            </span>
          )}
        </div>
      </div>

      <h2 style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "var(--space-md)" }}>Albums</h2>
      <table className="admin-table">
        <thead><tr><th className="admin-table__th">Title</th><th className="admin-table__th">Songs</th><th className="admin-table__th">Status</th><th className="admin-table__th">Release</th></tr></thead>
        <tbody>
          {albums.map((a) => (
            <tr key={a.id} className="admin-table__row">
              <td className="admin-table__td"><Link href={`/admin/music/albums/${a.id}`} className="admin-table__link">{a.title}</Link></td>
              <td className="admin-table__td">{albumSongCounts[a.id] || 0}</td>
              <td className="admin-table__td"><span className={`admin-status admin-status--${a.status}`}>{a.status}</span></td>
              <td className="admin-table__td admin-table__td--date">{a.release_date || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
