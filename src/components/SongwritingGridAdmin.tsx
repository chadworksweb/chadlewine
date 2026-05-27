"use client";

import { useMemo, useRef, useState } from "react";

export interface SongRow {
  id: string;
  title: string;
  available_for_a_voice: boolean;
  voice_display_order: number;
}

const MAX = 8;
type Status = "idle" | "saving" | "ok" | "err";
interface Picked {
  id: string;
  title: string;
}

export function SongwritingGridAdmin({
  songs,
  loadError = false,
}: {
  songs: SongRow[];
  loadError?: boolean;
}) {
  const initialSelected: Picked[] = songs
    .filter((s) => s.available_for_a_voice)
    .sort((a, b) => a.voice_display_order - b.voice_display_order)
    .map((s) => ({ id: s.id, title: s.title }));

  const [selected, setSelected] = useState<Picked[]>(initialSelected);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [msg, setMsg] = useState("");
  const dragFrom = useRef<number | null>(null);

  const selectedIds = useMemo(() => new Set(selected.map((s) => s.id)), [selected]);
  const full = selected.length >= MAX;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return songs
      .filter((s) => !selectedIds.has(s.id) && s.title.toLowerCase().includes(q))
      .slice(0, 10);
  }, [query, songs, selectedIds]);

  const add = (s: SongRow) => {
    if (full || selectedIds.has(s.id)) return;
    setSelected((cur) => [...cur, { id: s.id, title: s.title }]);
    setQuery("");
    setStatus("idle");
  };
  const remove = (id: string) => {
    setSelected((cur) => cur.filter((s) => s.id !== id));
    setStatus("idle");
  };
  const reorder = (to: number) => {
    const from = dragFrom.current;
    dragFrom.current = null;
    if (from === null || from === to) return;
    setSelected((cur) => {
      const next = [...cur];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setStatus("idle");
  };

  const save = async () => {
    setStatus("saving");
    setMsg("");
    try {
      const res = await fetch("/api/admin/songwriting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected: selected.map((s) => s.id) }),
      });
      if (res.ok) {
        setStatus("ok");
        setMsg("Saved.");
      } else {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setStatus("err");
        setMsg(d.error || "Save failed.");
      }
    } catch {
      setStatus("err");
      setMsg("Network error.");
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Songwriting Grid</h1>
      </div>
      <p style={{ marginBottom: "var(--space-lg)" }}>
        Search your published songs, add up to {MAX}, and drag to arrange the grid. New songs are
        created under <strong>Music &rarr; Songs</strong>.
      </p>

      {loadError && (
        <p style={{ color: "#ff6b6b", marginBottom: "var(--space-lg)" }}>
          Couldn&rsquo;t load songs &mdash; run migration{" "}
          <code>20260526130000_songs_available_for_a_voice.sql</code>, then refresh.
        </p>
      )}

      <div className="sw-grid-admin__search">
        <input
          type="text"
          placeholder={full ? `Maximum ${MAX} reached` : "Search songs to add..."}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={full}
          aria-label="Search songs to add"
        />
        {results.length > 0 && (
          <ul className="sw-grid-admin__results">
            {results.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => add(s)}>
                  {s.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="sw-grid-admin__count">
        {selected.length} / {MAX} selected
      </p>
      <ol className="sw-grid-admin__list">
        {selected.length === 0 && (
          <li className="sw-grid-admin__empty">No songs yet. Search above to add.</li>
        )}
        {selected.map((s, i) => (
          <li
            key={s.id}
            className="sw-grid-admin__item"
            draggable
            onDragStart={() => {
              dragFrom.current = i;
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => reorder(i)}
          >
            <span className="sw-grid-admin__handle" aria-hidden="true" />
            <span className="sw-grid-admin__pos">{i + 1}</span>
            <span className="sw-grid-admin__title">{s.title}</span>
            <button
              type="button"
              className="sw-grid-admin__remove"
              onClick={() => remove(s.id)}
              aria-label={`Remove ${s.title}`}
            >
              &times;
            </button>
          </li>
        ))}
      </ol>

      <div style={{ marginTop: "var(--space-lg)", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <button className="btn btn--primary" type="button" onClick={save} disabled={status === "saving"}>
          {status === "saving" ? "Saving..." : "Save"}
        </button>
        {msg && <span style={{ color: status === "err" ? "#ff6b6b" : "#46d39a" }}>{msg}</span>}
      </div>
    </div>
  );
}
