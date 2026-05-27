"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";

interface PillarSong {
  id: string;
  slug: string;
  title: string;
  status: string;
  art_image_path: string | null;
  position?: number;
  note?: string | null;
}

export default function AdminPillarSongsPage() {
  const [inList, setInList] = useState<PillarSong[]>([]);
  const [available, setAvailable] = useState<PillarSong[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);

  const fetchAll = useCallback(async () => {
    const res = await fetch("/api/admin/pillar-songs");
    if (res.ok) {
      const data = await res.json();
      setInList(data.in_list || []);
      setAvailable(data.available || []);
    } else {
      setError("Failed to load");
    }
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- client-side data load on mount
  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function persistOrder(ordered: PillarSong[]) {
    const res = await fetch("/api/admin/pillar-songs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ song_ids: ordered.map((s) => s.id) }),
    });
    if (!res.ok) {
      setError("Failed to save order");
      await fetchAll();
    }
  }

  async function addSong(songId: string) {
    setError("");
    const res = await fetch("/api/admin/pillar-songs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ song_id: songId }),
    });
    if (!res.ok) setError("Failed to add");
    await fetchAll();
  }

  async function removeSong(songId: string) {
    setError("");
    const res = await fetch(`/api/admin/pillar-songs?song_id=${encodeURIComponent(songId)}`, {
      method: "DELETE",
    });
    if (!res.ok) setError("Failed to remove");
    await fetchAll();
  }

  async function saveNote(songId: string, note: string) {
    const res = await fetch("/api/admin/pillar-songs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ song_id: songId, note }),
    });
    if (!res.ok) setError("Failed to save note");
  }

  function move(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= inList.length) return;
    const next = [...inList];
    const [moved] = next.splice(idx, 1);
    next.splice(newIdx, 0, moved);
    setInList(next);
    void persistOrder(next);
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    if (dragIdRef.current && dragIdRef.current !== id) setDragOverId(id);
  }
  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    const sourceId = dragIdRef.current;
    dragIdRef.current = null;
    setDragOverId(null);
    if (!sourceId || sourceId === targetId) return;
    const next = [...inList];
    const from = next.findIndex((s) => s.id === sourceId);
    const to = next.findIndex((s) => s.id === targetId);
    if (from === -1 || to === -1) return;
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setInList(next);
    void persistOrder(next);
  }

  if (loading) {
    return (
      <div className="admin-page">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p>
      </div>
    );
  }

  const filtered = available.filter(
    (s) => !filter || s.title.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Pillar Songs</h1>
        <Link href="/pillar-songs" className="admin-btn" target="_blank">View page</Link>
      </div>

      <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", maxWidth: 640, marginBottom: "var(--space-lg)" }}>
        The shrine of your own songs, in your order. Drag to reorder (or use the arrows). The note shows on the public page under each song -- why it matters to you.
      </p>

      {error && <p className="obsv-editor__error">{error}</p>}

      <section style={{ marginBottom: "var(--space-lg)" }}>
        <h2 style={{ fontSize: "1rem", marginBottom: "var(--space-sm)", color: "var(--text-secondary)" }}>
          In the shrine ({inList.length})
        </h2>
        {inList.length === 0 ? (
          <p style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>
            No songs yet. Add some from the list below.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {inList.map((s, i) => (
              <li
                key={s.id}
                draggable
                onDragStart={() => { dragIdRef.current = s.id; }}
                onDragOver={(e) => handleDragOver(e, s.id)}
                onDrop={(e) => handleDrop(e, s.id)}
                onDragEnd={() => { dragIdRef.current = null; setDragOverId(null); }}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 44px 1fr auto",
                  alignItems: "start",
                  gap: 12,
                  padding: 10,
                  borderRadius: 8,
                  background: "var(--bg-secondary, rgba(255,255,255,0.03))",
                  border: dragOverId === s.id ? "1px dashed var(--accent, #ffb627)" : "1px solid transparent",
                  cursor: "grab",
                }}
              >
                <span aria-hidden="true" style={{ color: "var(--text-tertiary)", paddingTop: 12, userSelect: "none" }}>::</span>
                {s.art_image_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.art_image_path} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 4 }} />
                ) : (
                  <div style={{ width: 44, height: 44, background: "var(--bg-tertiary, rgba(255,255,255,0.06))", borderRadius: 4 }} />
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{s.title}</div>
                  <textarea
                    defaultValue={s.note ?? ""}
                    placeholder="Why this one matters (optional)"
                    rows={2}
                    onBlur={(e) => { if (e.target.value.trim() !== (s.note ?? "")) void saveNote(s.id, e.target.value); }}
                    className="admin-meta-form__input"
                    style={{ width: "100%", resize: "vertical", fontFamily: "var(--font-ui)", fontSize: "0.85rem" }}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
                  <div style={{ whiteSpace: "nowrap" }}>
                    <button className="admin-btn" onClick={() => move(i, -1)} disabled={i === 0} style={{ marginRight: 4 }}>up</button>
                    <button className="admin-btn" onClick={() => move(i, 1)} disabled={i === inList.length - 1}>down</button>
                  </div>
                  <button className="admin-btn admin-btn--danger" onClick={() => removeSong(s.id)}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: "1rem", marginBottom: "var(--space-sm)", color: "var(--text-secondary)" }}>
          Add a song ({available.length} published, not in shrine)
        </h2>
        <input
          className="admin-meta-form__input"
          type="search"
          placeholder="Filter by title..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ width: 320, marginBottom: "var(--space-sm)" }}
        />
        {filtered.length === 0 ? (
          <p style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>No matching songs to add.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th className="admin-table__th" style={{ width: 60 }}>Art</th>
                <th className="admin-table__th">Title</th>
                <th className="admin-table__th" style={{ width: 100 }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="admin-table__row">
                  <td className="admin-table__td">
                    {s.art_image_path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.art_image_path} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }} />
                    ) : (
                      <div style={{ width: 40, height: 40, background: "var(--bg-secondary)", borderRadius: 4 }} />
                    )}
                  </td>
                  <td className="admin-table__td">{s.title}</td>
                  <td className="admin-table__td">
                    <button className="admin-btn admin-btn--primary" onClick={() => addSong(s.id)}>Add</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
