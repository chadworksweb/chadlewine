"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { slugify } from "@/lib/utils";
import { useAutosave } from "@/hooks/useAutosave";

interface AlbumData {
  id?: string;
  title: string;
  slug: string;
  release_date: string | null;
  cover_art_path: string | null;
  cover_art_alt: string | null;
  description: string | null;
  display_order: number;
  status: string;
  format_id: string | null;
  price: number | null;
}

const emptyAlbum: AlbumData = {
  title: "",
  slug: "",
  release_date: null,
  cover_art_path: null,
  cover_art_alt: null,
  description: null,
  display_order: 0,
  status: "draft",
  format_id: null,
  price: null,
};

export default function EditAlbumPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [form, setForm] = useState<AlbumData | null>(null);
  const [songs, setSongs] = useState<{ id: string; title: string; track_number: number; status: string }[]>([]);
  const [formats, setFormats] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/albums/${id}`).then(r => r.json()),
      fetch(`/api/admin/songs?album_id=${id}`).then(r => r.json()),
      fetch(`/api/admin/release-formats`).then(r => r.json()),
    ]).then(([album, sngs, fmts]) => {
      setForm({ ...emptyAlbum, ...album });
      setSongs(sngs);
      setFormats(fmts);
    });
  }, [id]);

  const set = useCallback((field: keyof AlbumData, value: unknown) => {
    setForm((prev) => prev ? { ...prev, [field]: value } : prev);
  }, []);

  const buildPayload = useCallback(
    (d: AlbumData) => ({
      title: d.title,
      slug: d.slug,
      release_date: d.release_date,
      cover_art_path: d.cover_art_path,
      cover_art_alt: d.cover_art_alt,
      description: d.description,
      display_order: d.display_order,
      status: d.status,
      format_id: d.format_id,
      price: d.price,
    }),
    []
  );

  const { status: autosaveStatus } = useAutosave({
    data: form || emptyAlbum,
    endpoint: "/api/admin/albums",
    id,
    buildPayload,
    enabled: !!form && !!form.title,
  });

  async function handleDelete() {
    if (!confirm("Delete album and all songs?")) return;
    await fetch(`/api/admin/albums/${id}`, { method: "DELETE" });
    router.push("/admin/music");
  }

  if (!form) return <div className="admin-page"><p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p></div>;

  return (
    <div className="obsv-editor">
      <div className="obsv-editor__header">
        <h1 className="admin-page__title">Edit Album</h1>
        <div className="obsv-editor__actions">
          {form.slug && (
            <Link href={`/music/albums/${form.slug}`} className="admin-btn admin-btn--secondary" target="_blank">View Album</Link>
          )}
          <button className="admin-btn admin-btn--danger" onClick={handleDelete} type="button">Delete</button>
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
              onChange={e => { set("title", e.target.value); if (!id) set("slug", slugify(e.target.value)); }}
            />
          </div>

          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="slug">Slug</label>
            <input
              id="slug"
              className="obsv-editor__input obsv-editor__input--mono"
              type="text"
              value={form.slug}
              onChange={e => set("slug", e.target.value)}
            />
          </div>

          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="description">Description</label>
            <textarea
              id="description"
              className="obsv-editor__input"
              value={form.description || ""}
              onChange={e => set("description", e.target.value || null)}
              rows={6}
              placeholder="About this album..."
            />
          </div>

          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="cover_art_path">Cover Art Path</label>
            <input
              id="cover_art_path"
              className="obsv-editor__input obsv-editor__input--mono"
              type="text"
              value={form.cover_art_path || ""}
              onChange={e => set("cover_art_path", e.target.value || null)}
              placeholder="https://cdn.bunny.net/..."
            />
          </div>

          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="cover_art_alt">Cover Art Alt Text</label>
            <input
              id="cover_art_alt"
              className="obsv-editor__input"
              type="text"
              value={form.cover_art_alt || ""}
              onChange={e => set("cover_art_alt", e.target.value || null)}
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="obsv-editor__sidebar">
          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Publish</h3>
            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="status">Status</label>
              <select id="status" className="obsv-editor__input" value={form.status} onChange={e => set("status", e.target.value)}>
                <option value="draft">Draft</option>
                <option value="unreleased">Unreleased</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>

          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Album Details</h3>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="format_id">Format</label>
              <select id="format_id" className="obsv-editor__input" value={form.format_id || ""} onChange={e => set("format_id", e.target.value || null)}>
                <option value="">— Select Format —</option>
                {formats.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="release_date">Release Date</label>
              <input id="release_date" className="obsv-editor__input" type="date" value={form.release_date || ""} onChange={e => set("release_date", e.target.value || null)} />
            </div>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="display_order">Display Order</label>
              <input id="display_order" className="obsv-editor__input" type="number" min={0} value={form.display_order} onChange={e => set("display_order", parseInt(e.target.value) || 0)} />
            </div>
          </div>

          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Commerce</h3>
            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="price">Album Price ($)</label>
              <input id="price" className="obsv-editor__input" type="number" min={0} step="0.01" value={form.price ?? ""} onChange={e => set("price", e.target.value ? parseFloat(e.target.value) : null)} placeholder="9.99" />
            </div>
          </div>
        </div>
      </div>

      {/* Songs listing below editor */}
      <h2 style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "var(--space-xl) 0 var(--space-md)" }}>Songs</h2>
      <Link href={`/admin/music/songs/new?album_id=${id}`} className="admin-btn admin-btn--secondary" style={{ marginBottom: "var(--space-md)", display: "inline-block" }}>Add Song</Link>
      <table className="admin-table">
        <thead><tr><th className="admin-table__th">#</th><th className="admin-table__th">Title</th><th className="admin-table__th">Status</th></tr></thead>
        <tbody>
          {songs.sort((a, b) => a.track_number - b.track_number).map(s => (
            <tr key={s.id} className="admin-table__row">
              <td className="admin-table__td">{s.track_number}</td>
              <td className="admin-table__td"><Link href={`/admin/music/songs/${s.id}`} className="admin-table__link">{s.title}</Link></td>
              <td className="admin-table__td"><span className={`admin-status admin-status--${s.status}`}>{s.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
