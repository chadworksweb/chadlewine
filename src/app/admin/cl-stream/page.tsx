"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface StreamSong {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  album_art_url: string | null;
  note: string | null;
  rc_color: string | null;
  rc_charge: number | null;
  created_at: string;
}

export default function CLStreamAdminPage() {
  const [songs, setSongs] = useState<StreamSong[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/cl-stream");
    if (res.ok) setSongs(await res.json());
    setLoading(false);
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`Delete "${title}"?`)) return;
    await fetch(`/api/admin/cl-stream/${id}`, { method: "DELETE" });
    load();
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">CL Stream</h1>
        <Link href="/admin/cl-stream/new" className="admin-btn admin-btn--primary">
          + Add Song
        </Link>
      </div>

      {loading && <p className="admin-empty">Loading...</p>}

      {!loading && songs.length === 0 && (
        <p className="admin-empty">No songs yet. Add the first one.</p>
      )}

      {!loading && songs.length > 0 && (
        <div className="cl-stream-admin-list">
          {songs.map((s) => (
            <div key={s.id} className="cl-stream-admin-row">
              {s.album_art_url && (
                <img src={s.album_art_url} alt={s.title} className="cl-stream-admin-row__art" />
              )}
              <div className="cl-stream-admin-row__info">
                <span className="cl-stream-admin-row__title">{s.title}</span>
                <span className="cl-stream-admin-row__artist">{s.artist}</span>
                {s.album && <span className="cl-stream-admin-row__album">{s.album}</span>}
                {s.rc_color && (
                  <span className="cl-stream-admin-row__badge" data-color={s.rc_color}>
                    {s.rc_color} {s.rc_charge != null ? (s.rc_charge > 0 ? `+${s.rc_charge}` : s.rc_charge) : ""}
                  </span>
                )}
                {s.note && <p className="cl-stream-admin-row__note">{s.note}</p>}
              </div>
              <div className="cl-stream-admin-row__actions">
                <span className="cl-stream-admin-row__date">
                  {new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
                <button
                  className="admin-btn admin-btn--danger admin-btn--sm"
                  onClick={() => handleDelete(s.id, s.title)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
