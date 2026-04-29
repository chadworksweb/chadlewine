"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/utils";

export default function NewCurationEntryPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    type: "album",
    title: "",
    slug: "",
    artist_name: "",
    description: "",
    body: "",
    cover_image_path: "",
    outbound_url: "",
    rising_compass_score: "",
    rising_compass_classification: "",
    genre: "",
    mood_tags: "",
    seo_title: "",
    seo_description: "",
    focus_keyphrase: "",
    status: "draft",
  });

  function set(field: string, value: string) {
    setForm({ ...form, [field]: value });
  }

  async function handleSave() {
    if (!form.title.trim() || !form.artist_name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/admin/curation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        slug: form.slug || slugify(form.title),
        rising_compass_score: form.rising_compass_score ? parseFloat(form.rising_compass_score) : null,
        mood_tags: form.mood_tags ? form.mood_tags.split(",").map(t => t.trim()).filter(Boolean) : [],
        cover_image_path: form.cover_image_path || null,
        outbound_url: form.outbound_url || null,
      }),
    });
    if (res.ok) {
      const saved = await res.json();
      router.push(`/admin/curation/${saved.slug || saved.id}`);
    }
    setSaving(false);
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">New Curation Entry</h1>
        <button className="admin-btn admin-btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Type</label>
        <select className="obsv-editor__input" value={form.type} onChange={e => set("type", e.target.value)}>
          <option value="album">Album</option>
          <option value="single">Single</option>
          <option value="playlist">Playlist</option>
        </select>
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Title</label>
        <input className="obsv-editor__input" value={form.title} onChange={e => set("title", e.target.value)} />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Artist</label>
        <input className="obsv-editor__input" value={form.artist_name} onChange={e => set("artist_name", e.target.value)} />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Slug</label>
        <input className="obsv-editor__input" value={form.slug} onChange={e => set("slug", e.target.value)} placeholder={form.title ? slugify(form.title) : "auto"} />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Description</label>
        <textarea className="obsv-editor__input" value={form.description} onChange={e => set("description", e.target.value)} rows={2} />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Editorial Body</label>
        <textarea className="obsv-editor__input" value={form.body} onChange={e => set("body", e.target.value)} rows={8} />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Cover Image Path</label>
        <input className="obsv-editor__input" value={form.cover_image_path} onChange={e => set("cover_image_path", e.target.value)} placeholder="Supabase Storage path (.webp)" />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Primary Listen Link</label>
        <input className="obsv-editor__input" value={form.outbound_url} onChange={e => set("outbound_url", e.target.value)} placeholder="https://open.spotify.com/..." />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Rising Compass Score</label>
        <input className="obsv-editor__input" type="number" step="0.01" min="0" max="100" value={form.rising_compass_score} onChange={e => set("rising_compass_score", e.target.value)} />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">RC Classification</label>
        <input className="obsv-editor__input" value={form.rising_compass_classification} onChange={e => set("rising_compass_classification", e.target.value)} />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Genre</label>
        <input className="obsv-editor__input" value={form.genre} onChange={e => set("genre", e.target.value)} />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Mood Tags (comma-separated)</label>
        <input className="obsv-editor__input" value={form.mood_tags} onChange={e => set("mood_tags", e.target.value)} placeholder="uplifting, hopeful, energetic" />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">SEO Title</label>
        <input className="obsv-editor__input" value={form.seo_title} onChange={e => set("seo_title", e.target.value)} />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">SEO Description</label>
        <textarea className="obsv-editor__input" value={form.seo_description} onChange={e => set("seo_description", e.target.value)} rows={2} />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Focus Keyphrase</label>
        <input className="obsv-editor__input" value={form.focus_keyphrase} onChange={e => set("focus_keyphrase", e.target.value)} />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Status</label>
        <select className="obsv-editor__input" value={form.status} onChange={e => set("status", e.target.value)}>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </div>
    </div>
  );
}
