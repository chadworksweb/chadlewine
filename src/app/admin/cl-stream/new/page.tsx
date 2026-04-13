"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function NewStreamSongPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState("");
  const [artPreview, setArtPreview] = useState("");
  const [needsLyrics, setNeedsLyrics] = useState(false);
  const [lyrics, setLyrics] = useState("");
  const [form, setForm] = useState({
    source_url: "",
    title: "",
    artist: "",
    album: "",
    album_art_url: "",
    note: "",
  });
  const urlRef = useRef<HTMLInputElement>(null);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function resolveUrl() {
    const url = form.source_url.trim();
    if (!url) return;
    setResolving(true);
    setResolveError("");
    try {
      const res = await fetch("/api/admin/resolve-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResolveError(data.error || "Could not resolve URL");
        return;
      }
      setForm((f) => ({
        ...f,
        title: data.title || f.title,
        artist: data.artist || f.artist,
        album_art_url: data.album_art_url || f.album_art_url,
      }));
      if (data.album_art_url) setArtPreview(data.album_art_url);
    } finally {
      setResolving(false);
    }
  }

  async function handleSave(withLyrics = false) {
    if (!form.title.trim() || !form.artist.trim()) return;
    setSaving(true);
    try {
      const payload: Record<string, string> = { ...form };
      if (withLyrics && lyrics.trim()) payload.lyrics = lyrics.trim();

      const res = await fetch("/api/admin/cl-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 202) {
        // RC doesn't have this song — need lyrics
        setNeedsLyrics(true);
        return;
      }

      if (res.ok) {
        router.push("/admin/cl-stream");
        return;
      }

      const err = await res.json().catch(() => ({}));
      alert(err.error || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Add to CL Stream</h1>
        {!needsLyrics && (
          <button
            className="admin-btn admin-btn--primary"
            onClick={() => handleSave(false)}
            disabled={saving || !form.title.trim() || !form.artist.trim()}
          >
            {saving ? "Checking..." : "Add to Stream"}
          </button>
        )}
      </div>

      {/* Step 1 — song details */}
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Paste a link (Tidal, etc.)</label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input
            ref={urlRef}
            className="obsv-editor__input"
            value={form.source_url}
            onChange={(e) => set("source_url", e.target.value)}
            onBlur={resolveUrl}
            placeholder="https://tidal.com/browse/track/..."
          />
          <button
            className="admin-btn"
            type="button"
            onClick={resolveUrl}
            disabled={resolving || !form.source_url.trim()}
          >
            {resolving ? "Resolving..." : "Resolve"}
          </button>
        </div>
        {resolveError && (
          <p style={{ color: "var(--error, #c0392b)", fontSize: "0.8rem", marginTop: "0.3rem" }}>
            {resolveError}
          </p>
        )}
      </div>

      {artPreview && (
        <div style={{ marginBottom: "1rem" }}>
          <img
            src={artPreview}
            alt="Album art preview"
            style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 4 }}
          />
        </div>
      )}

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Title</label>
        <input
          className="obsv-editor__input"
          value={form.title}
          onChange={(e) => set("title", e.target.value)}
        />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Artist</label>
        <input
          className="obsv-editor__input"
          value={form.artist}
          onChange={(e) => set("artist", e.target.value)}
        />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Album</label>
        <input
          className="obsv-editor__input"
          value={form.album}
          onChange={(e) => set("album", e.target.value)}
          placeholder="Optional"
        />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Album Art URL</label>
        <input
          className="obsv-editor__input"
          value={form.album_art_url}
          onChange={(e) => {
            set("album_art_url", e.target.value);
            setArtPreview(e.target.value);
          }}
          placeholder="Auto-filled from link or paste manually"
        />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Why this song</label>
        <textarea
          className="obsv-editor__input"
          value={form.note}
          onChange={(e) => set("note", e.target.value)}
          rows={3}
          placeholder="Optional — what caught your ear"
        />
      </div>

      {/* Step 2 — lyrics (only shown when RC doesn't have the song) */}
      {needsLyrics && (
        <div style={{ marginTop: "1.5rem", borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: "1.5rem" }}>
          <p style={{ marginBottom: "0.75rem", fontSize: "0.9rem" }}>
            <strong style={{ color: "var(--text-primary)" }}>{form.title}</strong> by{" "}
            <strong style={{ color: "var(--text-primary)" }}>{form.artist}</strong> isn&apos;t in Rising Compass yet.
            Paste the lyrics to calibrate it.
          </p>
          <div className="obsv-editor__field">
            <label className="obsv-editor__label">Lyrics</label>
            <textarea
              className="obsv-editor__input"
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              rows={14}
              placeholder="Paste full lyrics here..."
              autoFocus
            />
          </div>
          <button
            className="admin-btn admin-btn--primary"
            onClick={() => handleSave(true)}
            disabled={saving || !lyrics.trim()}
          >
            {saving ? "Calibrating..." : "Calibrate & Add to Stream"}
          </button>
        </div>
      )}
    </div>
  );
}
