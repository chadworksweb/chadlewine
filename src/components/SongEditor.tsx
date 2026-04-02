"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { slugify } from "@/lib/utils";
import { useAutosave } from "@/hooks/useAutosave";

interface ExpansionSummary {
  id: string;
  title: string;
  status: string;
  display_order: number;
}

interface SongData {
  id?: string;
  album_id: string;
  title: string;
  slug: string;
  track_number: number;
  duration_seconds: number | null;
  streaming_path: string | null;
  download_path: string | null;
  lyrics: string | null;
  price: number | null;
  is_single: boolean;
  status: string;
  release_date: string | null;
  song_summary: string | null;
  isrc: string | null;
}

const emptySong: SongData = {
  album_id: "",
  title: "",
  slug: "",
  track_number: 1,
  duration_seconds: null,
  streaming_path: null,
  download_path: null,
  lyrics: null,
  price: null,
  is_single: false,
  status: "draft",
  release_date: null,
  song_summary: null,
  isrc: null,
};

interface AlbumOption {
  id: string;
  title: string;
}

export function SongEditor({ initial, presetAlbumId }: { initial?: SongData; presetAlbumId?: string }) {
  const router = useRouter();
  const [form, setForm] = useState<SongData>(
    initial || { ...emptySong, album_id: presetAlbumId || "" }
  );
  const [albums, setAlbums] = useState<AlbumOption[]>([]);
  const [expansions, setExpansions] = useState<ExpansionSummary[]>([]);

  useEffect(() => {
    fetch("/api/admin/albums")
      .then((r) => r.json())
      .then((data: AlbumOption[]) => setAlbums(data));
  }, []);

  useEffect(() => {
    if (!form.id) return;
    fetch(`/api/admin/expansions?song_id=${form.id}`)
      .then((r) => r.json())
      .then((data: ExpansionSummary[]) => setExpansions(data));
  }, [form.id]);

  const set = useCallback((field: keyof SongData, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  function handleTitleChange(value: string) {
    set("title", value);
    if (!form.id) {
      set("slug", slugify(value));
    }
  }

  const buildPayload = useCallback(
    (d: SongData) => ({
      album_id: d.album_id,
      title: d.title,
      slug: d.slug,
      track_number: d.track_number,
      duration_seconds: d.duration_seconds,
      streaming_path: d.streaming_path,
      download_path: d.download_path,
      lyrics: d.lyrics,
      price: d.price,
      is_single: d.is_single,
      status: d.status,
      release_date: d.release_date,
      song_summary: d.song_summary,
      isrc: d.isrc,
    }),
    []
  );

  const { status: autosaveStatus } = useAutosave({
    data: form,
    endpoint: "/api/admin/songs",
    id: form.id,
    buildPayload,
    onCreated: (newId) => {
      setForm((prev) => ({ ...prev, id: newId }));
      router.replace(`/admin/music/songs/${newId}`, { scroll: false });
    },
    enabled: !!form.title && !!form.album_id,
  });

  async function handleDelete() {
    if (!form.id) return;
    if (!confirm("Delete this song? This cannot be undone.")) return;
    const res = await fetch(`/api/admin/songs/${form.id}`, { method: "DELETE" });
    if (res.ok) router.push("/admin/music");
  }

  return (
    <div className="obsv-editor">
      <div className="obsv-editor__header">
        <h1 className="admin-page__title">
          {!form.id ? "New Song" : "Edit Song"}
        </h1>
        <div className="obsv-editor__actions">
          {form.id && (
            <button
              className="admin-btn admin-btn--danger"
              onClick={handleDelete}
              type="button"
            >
              Delete
            </button>
          )}
          <span className={`autosave-status autosave-status--${autosaveStatus}`}>
            {autosaveStatus === "saving" && "Saving..."}
            {autosaveStatus === "saved" && "Saved"}
            {autosaveStatus === "error" && "Save failed"}
          </span>
        </div>
      </div>

      <div className="obsv-editor__grid">
        {/* Main column */}
        <div className="obsv-editor__main">
          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="title">Title</label>
            <input
              id="title"
              className="obsv-editor__input"
              type="text"
              value={form.title}
              onChange={(e) => handleTitleChange(e.target.value)}
            />
          </div>

          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="slug">Slug</label>
            <input
              id="slug"
              className="obsv-editor__input obsv-editor__input--mono"
              type="text"
              value={form.slug}
              onChange={(e) => set("slug", e.target.value)}
            />
          </div>

          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="lyrics">Lyrics</label>
            <textarea
              id="lyrics"
              className="obsv-editor__input"
              value={form.lyrics || ""}
              onChange={(e) => set("lyrics", e.target.value || null)}
              rows={16}
              style={{ fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap" }}
            />
          </div>

          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="song_summary">Song Summary</label>
            <textarea
              id="song_summary"
              className="obsv-editor__input"
              value={form.song_summary || ""}
              onChange={(e) => set("song_summary", e.target.value || null)}
              rows={4}
              placeholder="About this song..."
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="obsv-editor__sidebar">
          {/* Publish */}
          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Publish</h3>
            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="status">Status</label>
              <select
                id="status"
                className="obsv-editor__input"
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>

          {/* Song Details */}
          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Song Details</h3>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="album_id">Parent Album</label>
              <select
                id="album_id"
                className="obsv-editor__input"
                value={form.album_id}
                onChange={(e) => set("album_id", e.target.value)}
              >
                <option value="">Select album...</option>
                {albums.map((a) => (
                  <option key={a.id} value={a.id}>{a.title}</option>
                ))}
              </select>
            </div>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="track_number">Track Number</label>
              <input
                id="track_number"
                className="obsv-editor__input"
                type="number"
                min={1}
                value={form.track_number}
                onChange={(e) => set("track_number", parseInt(e.target.value) || 1)}
              />
            </div>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="duration_seconds">Duration (seconds)</label>
              <input
                id="duration_seconds"
                className="obsv-editor__input"
                type="number"
                min={0}
                value={form.duration_seconds ?? ""}
                onChange={(e) => set("duration_seconds", e.target.value ? parseInt(e.target.value) : null)}
              />
            </div>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="release_date">Release Date</label>
              <input
                id="release_date"
                className="obsv-editor__input"
                type="date"
                value={form.release_date || ""}
                onChange={(e) => set("release_date", e.target.value || null)}
              />
            </div>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="isrc">ISRC</label>
              <input
                id="isrc"
                className="obsv-editor__input obsv-editor__input--mono"
                type="text"
                value={form.isrc || ""}
                onChange={(e) => set("isrc", e.target.value || null)}
                placeholder="CC-XXX-YY-NNNNN"
              />
            </div>
          </div>

          {/* Files */}
          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Files</h3>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="streaming_path">Streaming File Path</label>
              <input
                id="streaming_path"
                className="obsv-editor__input obsv-editor__input--mono"
                type="text"
                value={form.streaming_path || ""}
                onChange={(e) => set("streaming_path", e.target.value || null)}
                placeholder="https://cdn.bunny.net/..."
              />
            </div>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="download_path">Download File Path</label>
              <input
                id="download_path"
                className="obsv-editor__input obsv-editor__input--mono"
                type="text"
                value={form.download_path || ""}
                onChange={(e) => set("download_path", e.target.value || null)}
                placeholder="https://cdn.bunny.net/..."
              />
            </div>
          </div>

          {/* Commerce */}
          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Commerce</h3>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="price">Price ($)</label>
              <input
                id="price"
                className="obsv-editor__input"
                type="number"
                min={0}
                value={form.price ?? ""}
                step="0.01"
                onChange={(e) => set("price", e.target.value ? parseFloat(e.target.value) : null)}
                placeholder="1.99"
              />
            </div>

            <div className="obsv-editor__field" style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
              <input
                id="is_single"
                type="checkbox"
                checked={form.is_single}
                onChange={(e) => set("is_single", e.target.checked)}
              />
              <label className="obsv-editor__label" htmlFor="is_single" style={{ margin: 0 }}>Is Single</label>
            </div>
          </div>

          {/* Expansions */}
          {form.id && (
            <div className="obsv-editor__panel">
              <h3 className="obsv-editor__panel-title">Expansions</h3>
              {expansions.length > 0 ? (
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 0.75rem" }}>
                  {expansions.map((exp) => (
                    <li key={exp.id} style={{ marginBottom: "0.35rem" }}>
                      <Link
                        href={`/admin/music/songs/${form.id}/expansions/${exp.id}`}
                        style={{ color: "var(--text-link)", fontFamily: "var(--font-ui)", fontSize: "0.875rem" }}
                      >
                        {exp.title || "Untitled"}
                      </Link>
                      <span style={{ color: "var(--text-tertiary)", fontSize: "0.75rem", marginLeft: "0.5rem" }}>
                        {exp.status}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", fontSize: "0.875rem", margin: "0 0 0.75rem" }}>
                  No expansions yet.
                </p>
              )}
              <Link
                href={`/admin/music/songs/${form.id}/expansions/new`}
                className="admin-btn"
                style={{ display: "inline-block", fontSize: "0.875rem" }}
              >
                + Add Expansion
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
