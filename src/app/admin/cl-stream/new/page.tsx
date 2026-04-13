"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";

export default function NewStreamSongPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState("");
  const [artPreview, setArtPreview] = useState("");
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

  async function handleSave() {
    if (!form.title.trim() || !form.artist.trim()) return;
    setSaving(true);
    const res = await fetch("/api/admin/cl-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      router.push("/admin/cl-stream");
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Save failed");
    }
    setSaving(false);
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Add to CL Stream</h1>
        <button
          className="admin-btn admin-btn--primary"
          onClick={handleSave}
          disabled={saving || !form.title.trim() || !form.artist.trim()}
        >
          {saving ? "Saving..." : "Add to Stream"}
        </button>
      </div>

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
    </div>
  );
}
