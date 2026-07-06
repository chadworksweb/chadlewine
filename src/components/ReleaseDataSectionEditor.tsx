"use client";

import { useState, useEffect, useCallback } from "react";
import { useAutosave } from "@/hooks/useAutosave";
import type {
  ReleaseVisibilitySection,
  ReleaseVisibilityCategoryDef,
  ReleaseArtAspect,
} from "@/lib/release-visibility";

interface Props {
  albumId: string;
  section: ReleaseVisibilitySection;
  cat: ReleaseVisibilityCategoryDef;
  onChanged: () => void;
}

export function ReleaseDataSectionEditor({ albumId, section, cat, onChanged }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState(section.status);
  const [payload, setPayload] = useState<Record<string, unknown>>(section.data_payload || {});

  // Resync to incoming section when the parent swaps it (refetch after save,
  // category switch). Adjusts during render only when the prop identity
  // actually changes — replaces a useEffect that fired one render late.
  const [lastSectionStatus, setLastSectionStatus] = useState(section.status);
  const [lastSectionPayload, setLastSectionPayload] = useState(section.data_payload);
  if (section.status !== lastSectionStatus || section.data_payload !== lastSectionPayload) {
    setLastSectionStatus(section.status);
    setLastSectionPayload(section.data_payload);
    setStatus(section.status);
    setPayload(section.data_payload || {});
  }

  const buildPayload = useCallback(
    () => ({ data_payload: payload, status }),
    [payload, status],
  );

  const { status: saveStatus } = useAutosave({
    data: { payload, status },
    endpoint: "/api/admin/release-visibility-sections",
    id: section.id,
    buildPayload,
    enabled: true,
  });

  const populated = Object.keys(payload).length > 0 && hasMeaningfulPayload(cat.slug, payload);

  return (
    <div className="song-visibility__section">
      <button
        type="button"
        className="song-visibility__section-header"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="song-visibility__section-arrow">{expanded ? "▾" : "▸"}</span>
        <span className="song-visibility__section-label">{cat.label}</span>
        <span className={`song-visibility__section-badge song-visibility__section-badge--${populated ? status : "empty"}`}>
          {populated ? status : "empty"}
        </span>
        {saveStatus === "saving" && (
          <span style={{ color: "var(--text-tertiary)", fontSize: "0.7rem", marginLeft: "auto" }}>Saving...</span>
        )}
      </button>
      {expanded && (
        <div className="song-visibility__section-body">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <label style={{ fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
              Status:
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as "draft" | "published")}
              className="obsv-editor__select"
              style={{ fontSize: "0.75rem" }}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </div>

          <PickerForSlug
            slug={cat.slug}
            albumId={albumId}
            payload={payload}
            onChange={(p) => { setPayload(p); onChanged(); }}
          />
        </div>
      )}
    </div>
  );
}

function hasMeaningfulPayload(slug: string, p: Record<string, unknown>): boolean {
  switch (slug) {
    case "release-track-grid": {
      const ids = (p as { song_ids?: string[] | null }).song_ids;
      // null = auto (publishable). Empty array = nothing picked. Non-empty = picks.
      return ids === null || (Array.isArray(ids) && ids.length > 0);
    }
    case "lyrics": {
      const ids = (p as { song_ids?: string[] }).song_ids || [];
      return Array.isArray(ids) && ids.length > 0;
    }
    case "art":
    case "video": {
      const items = (p as { items?: unknown[] }).items || [];
      return Array.isArray(items) && items.length > 0;
    }
    default:
      return false;
  }
}

// ─── Picker switchboard ─────────────────────────────────────────────────────

interface PickerProps {
  slug: string;
  albumId: string;
  payload: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

function PickerForSlug({ slug, albumId, payload, onChange }: PickerProps) {
  switch (slug) {
    case "release-track-grid":
      return <SongSliderPicker albumId={albumId} payload={payload} onChange={onChange} />;
    case "lyrics":
      return <LyricsPicker albumId={albumId} payload={payload} onChange={onChange} />;
    case "art":
      return <ArtPicker albumId={albumId} payload={payload} onChange={onChange} />;
    case "video":
      return <VideoPicker payload={payload} onChange={onChange} />;
    default:
      return <pre style={{ fontSize: "0.7rem", color: "var(--text-tertiary)" }}>{JSON.stringify(payload, null, 2)}</pre>;
  }
}

// ─── Reusable list helpers ──────────────────────────────────────────────────

function moveItem<T>(arr: T[], idx: number, dir: -1 | 1): T[] {
  const next = [...arr];
  const j = idx + dir;
  if (j < 0 || j >= next.length) return next;
  [next[idx], next[j]] = [next[j], next[idx]];
  return next;
}

const headerLabel: React.CSSProperties = {
  fontFamily: "var(--font-ui)",
  fontSize: "0.7rem",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--text-tertiary)",
  margin: "0.5rem 0 0.25rem",
};

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.4rem 0.5rem",
  border: "1px solid var(--bg-glass-border)",
  borderRadius: 4,
  marginBottom: "0.25rem",
  fontFamily: "var(--font-ui)",
  fontSize: "0.8rem",
};

// ─── Song Slider ────────────────────────────────────────────────────────────

interface AlbumSong { id: string; title: string; track_number: number; status: string }

function SongSliderPicker({ albumId, payload, onChange }: { albumId: string; payload: Record<string, unknown>; onChange: (p: Record<string, unknown>) => void }) {
  const [songs, setSongs] = useState<AlbumSong[]>([]);
  const ids = (payload as { song_ids?: string[] | null }).song_ids;
  const mode: "auto" | "manual" = ids === null || ids === undefined ? "auto" : "manual";
  const picked = Array.isArray(ids) ? ids : [];

  useEffect(() => {
    fetch(`/api/admin/songs?release_id=${albumId}`)
      .then((r) => r.json())
      .then((data) => setSongs(Array.isArray(data) ? data : []))
      .catch(() => setSongs([]));
  }, [albumId]);

  function setMode(next: "auto" | "manual") {
    onChange({ song_ids: next === "auto" ? null : (picked.length ? picked : songs.map((s) => s.id)) });
  }

  function toggle(id: string) {
    const set = new Set(picked);
    if (set.has(id)) set.delete(id); else set.add(id);
    onChange({ song_ids: Array.from(set) });
  }

  function move(idx: number, dir: -1 | 1) {
    onChange({ song_ids: moveItem(picked, idx, dir) });
  }

  return (
    <div>
      <div style={headerLabel}>Mode</div>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <label style={{ fontFamily: "var(--font-ui)", fontSize: "0.8rem", display: "flex", gap: "0.25rem", alignItems: "center" }}>
          <input type="radio" checked={mode === "auto"} onChange={() => setMode("auto")} />
          Auto (all songs, track order)
        </label>
        <label style={{ fontFamily: "var(--font-ui)", fontSize: "0.8rem", display: "flex", gap: "0.25rem", alignItems: "center" }}>
          <input type="radio" checked={mode === "manual"} onChange={() => setMode("manual")} />
          Manual pick + order
        </label>
      </div>
      {mode === "manual" && (
        <>
          <div style={headerLabel}>Picked ({picked.length})</div>
          {picked.map((id, i) => {
            const s = songs.find((x) => x.id === id);
            return (
              <div key={id} style={rowStyle}>
                <span style={{ flex: 1 }}>{s ? `${s.track_number}. ${s.title}` : id}</span>
                <button type="button" className="admin-btn" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }} onClick={() => move(i, -1)}>↑</button>
                <button type="button" className="admin-btn" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }} onClick={() => move(i, 1)}>↓</button>
                <button type="button" className="admin-btn admin-btn--danger" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }} onClick={() => toggle(id)}>✕</button>
              </div>
            );
          })}
          <div style={headerLabel}>Available</div>
          {songs.filter((s) => !picked.includes(s.id)).map((s) => (
            <div key={s.id} style={rowStyle}>
              <span style={{ flex: 1 }}>{s.track_number}. {s.title}</span>
              <span style={{ fontSize: "0.7rem", color: "var(--text-tertiary)" }}>{s.status}</span>
              <button type="button" className="admin-btn" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }} onClick={() => toggle(s.id)}>+ add</button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ─── Lyrics ─────────────────────────────────────────────────────────────────

function LyricsPicker({ albumId, payload, onChange }: { albumId: string; payload: Record<string, unknown>; onChange: (p: Record<string, unknown>) => void }) {
  const [songs, setSongs] = useState<AlbumSong[]>([]);
  const picked = ((payload as { song_ids?: string[] }).song_ids) || [];

  useEffect(() => {
    fetch(`/api/admin/songs?release_id=${albumId}`)
      .then((r) => r.json())
      .then((data) => setSongs(Array.isArray(data) ? data : []))
      .catch(() => setSongs([]));
  }, [albumId]);

  function toggle(id: string) {
    const set = new Set(picked);
    if (set.has(id)) set.delete(id); else set.add(id);
    onChange({ song_ids: Array.from(set) });
  }

  function move(idx: number, dir: -1 | 1) {
    onChange({ song_ids: moveItem(picked, idx, dir) });
  }

  return (
    <div>
      <div style={headerLabel}>Tracks to feature ({picked.length})</div>
      {picked.map((id, i) => {
        const s = songs.find((x) => x.id === id);
        return (
          <div key={id} style={rowStyle}>
            <span style={{ flex: 1 }}>{s ? `${s.track_number}. ${s.title}` : id}</span>
            <button type="button" className="admin-btn" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }} onClick={() => move(i, -1)}>↑</button>
            <button type="button" className="admin-btn" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }} onClick={() => move(i, 1)}>↓</button>
            <button type="button" className="admin-btn admin-btn--danger" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }} onClick={() => toggle(id)}>✕</button>
          </div>
        );
      })}
      <div style={headerLabel}>Available</div>
      {songs.filter((s) => !picked.includes(s.id)).map((s) => (
        <div key={s.id} style={rowStyle}>
          <span style={{ flex: 1 }}>{s.track_number}. {s.title}</span>
          <button type="button" className="admin-btn" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }} onClick={() => toggle(s.id)}>+ add</button>
        </div>
      ))}
    </div>
  );
}

// ─── Art ────────────────────────────────────────────────────────────────────

type ArtItem =
  | { kind: "song-art"; song_id: string; aspect: ReleaseArtAspect }
  | { kind: "album-cover"; aspect: ReleaseArtAspect }
  | { kind: "url"; url: string; alt: string | null; aspect: ReleaseArtAspect };

function ArtPicker({ albumId, payload, onChange }: { albumId: string; payload: Record<string, unknown>; onChange: (p: Record<string, unknown>) => void }) {
  const [songs, setSongs] = useState<AlbumSong[]>([]);
  const items: ArtItem[] = ((payload as { items?: ArtItem[] }).items) || [];

  useEffect(() => {
    fetch(`/api/admin/songs?release_id=${albumId}`)
      .then((r) => r.json())
      .then((data) => setSongs(Array.isArray(data) ? data : []))
      .catch(() => setSongs([]));
  }, [albumId]);

  function update(next: ArtItem[]) {
    onChange({ items: next });
  }

  function add(item: ArtItem) {
    update([...items, item]);
  }

  function remove(idx: number) {
    update(items.filter((_, i) => i !== idx));
  }

  function move(idx: number, dir: -1 | 1) {
    update(moveItem(items, idx, dir));
  }

  function setAspect(idx: number, aspect: ReleaseArtAspect) {
    update(items.map((it, i) => (i === idx ? { ...it, aspect } : it)));
  }

  return (
    <div>
      <div style={headerLabel}>Items ({items.length})</div>
      {items.map((it, i) => (
        <div key={i} style={rowStyle}>
          <span style={{ flex: 1, fontSize: "0.78rem" }}>
            {it.kind === "song-art" && (() => {
              const s = songs.find((x) => x.id === it.song_id);
              return s ? `Song art — ${s.track_number}. ${s.title}` : `Song art — ${it.song_id}`;
            })()}
            {it.kind === "album-cover" && "Album cover"}
            {it.kind === "url" && `URL — ${it.url}`}
          </span>
          <select value={it.aspect} onChange={(e) => setAspect(i, e.target.value as ReleaseArtAspect)} className="obsv-editor__select" style={{ fontSize: "0.7rem" }}>
            <option value="landscape">Landscape</option>
            <option value="square">Square</option>
            <option value="portrait">Portrait</option>
          </select>
          <button type="button" className="admin-btn" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }} onClick={() => move(i, -1)}>↑</button>
          <button type="button" className="admin-btn" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }} onClick={() => move(i, 1)}>↓</button>
          <button type="button" className="admin-btn admin-btn--danger" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }} onClick={() => remove(i)}>✕</button>
        </div>
      ))}

      <div style={headerLabel}>Add</div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <button type="button" className="admin-btn" onClick={() => add({ kind: "album-cover", aspect: "square" })} style={{ fontSize: "0.7rem" }}>+ Album cover</button>
        <AddSongArtControl songs={songs} onPick={(song_id) => add({ kind: "song-art", song_id, aspect: "square" })} />
        <AddUrlControl onAdd={(url, alt) => add({ kind: "url", url, alt, aspect: "landscape" })} />
      </div>
    </div>
  );
}

function AddSongArtControl({ songs, onPick }: { songs: AlbumSong[]; onPick: (id: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div style={{ display: "flex", gap: "0.25rem" }}>
      <select value={val} onChange={(e) => setVal(e.target.value)} className="obsv-editor__select" style={{ fontSize: "0.7rem" }}>
        <option value="">— pick song —</option>
        {songs.map((s) => <option key={s.id} value={s.id}>{s.track_number}. {s.title}</option>)}
      </select>
      <button type="button" className="admin-btn" disabled={!val} onClick={() => { if (val) { onPick(val); setVal(""); } }} style={{ fontSize: "0.7rem" }}>+ Song art</button>
    </div>
  );
}

function AddUrlControl({ onAdd }: { onAdd: (url: string, alt: string | null) => void }) {
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  return (
    <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
      <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="image URL" className="obsv-editor__input" style={{ fontSize: "0.7rem", minWidth: 200 }} />
      <input value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="alt" className="obsv-editor__input" style={{ fontSize: "0.7rem", minWidth: 120 }} />
      <button type="button" className="admin-btn" disabled={!url} onClick={() => { onAdd(url, alt || null); setUrl(""); setAlt(""); }} style={{ fontSize: "0.7rem" }}>+ URL</button>
    </div>
  );
}

// ─── Video ──────────────────────────────────────────────────────────────────

interface VideoItem { title: string; url: string; poster: string | null; label: string | null }

function VideoPicker({ payload, onChange }: { payload: Record<string, unknown>; onChange: (p: Record<string, unknown>) => void }) {
  const items: VideoItem[] = ((payload as { items?: VideoItem[] }).items) || [];
  const [draft, setDraft] = useState<VideoItem>({ title: "", url: "", poster: null, label: null });

  function update(next: VideoItem[]) { onChange({ items: next }); }
  function remove(i: number) { update(items.filter((_, j) => j !== i)); }
  function move(i: number, dir: -1 | 1) { update(moveItem(items, i, dir)); }

  function add() {
    if (!draft.title || !draft.url) return;
    update([...items, draft]);
    setDraft({ title: "", url: "", poster: null, label: null });
  }

  return (
    <div>
      <div style={headerLabel}>Videos ({items.length})</div>
      {items.map((it, i) => (
        <div key={i} style={rowStyle}>
          <span style={{ flex: 1, fontSize: "0.78rem" }}>
            <strong>{it.title}</strong>{it.label ? ` · ${it.label}` : ""}<br />
            <span style={{ color: "var(--text-tertiary)", fontSize: "0.7rem" }}>{it.url}</span>
          </span>
          <button type="button" className="admin-btn" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }} onClick={() => move(i, -1)}>↑</button>
          <button type="button" className="admin-btn" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }} onClick={() => move(i, 1)}>↓</button>
          <button type="button" className="admin-btn admin-btn--danger" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }} onClick={() => remove(i)}>✕</button>
        </div>
      ))}
      <div style={headerLabel}>Add video</div>
      <div style={{ display: "grid", gap: "0.25rem", gridTemplateColumns: "1fr 1fr" }}>
        <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Title" className="obsv-editor__input" style={{ fontSize: "0.75rem" }} />
        <input value={draft.label || ""} onChange={(e) => setDraft({ ...draft, label: e.target.value || null })} placeholder="Label (Music Video, Lyric, BTS...)" className="obsv-editor__input" style={{ fontSize: "0.75rem" }} />
        <input value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="Video URL (YouTube/Vimeo/MP4)" className="obsv-editor__input" style={{ fontSize: "0.75rem", gridColumn: "1 / span 2" }} />
        <input value={draft.poster || ""} onChange={(e) => setDraft({ ...draft, poster: e.target.value || null })} placeholder="Poster image URL (optional)" className="obsv-editor__input" style={{ fontSize: "0.75rem", gridColumn: "1 / span 2" }} />
      </div>
      <button type="button" className="admin-btn" onClick={add} disabled={!draft.title || !draft.url} style={{ fontSize: "0.75rem", marginTop: "0.5rem" }}>+ Add video</button>
    </div>
  );
}
