"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { slugify } from "@/lib/utils";

interface PlaylistTrack {
  id: string;
  track_title: string;
  artist_name: string;
  outbound_url: string;
  rising_compass_score: number | null;
  display_order: number;
}

export default function EditCurationEntryPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    type: "album",
    title: "",
    slug: "",
    artist_name: "",
    description: "",
    body: "",
    cover_image_path: "",
    outbound_url: "",
    outbound_links: "[]",
    rising_compass_score: "",
    rising_compass_classification: "",
    genre: "",
    mood_tags: "",
    seo_title: "",
    seo_description: "",
    focus_keyphrase: "",
    status: "draft",
    display_order: "0",
  });

  // Playlist tracks
  const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
  const [newTrack, setNewTrack] = useState({ track_title: "", artist_name: "", outbound_url: "", rising_compass_score: "" });

  const fetchEntry = useCallback(async () => {
    const res = await fetch(`/api/admin/curation/${id}`);
    const data = await res.json();
    setForm({
      type: data.type || "album",
      title: data.title || "",
      slug: data.slug || "",
      artist_name: data.artist_name || "",
      description: data.description || "",
      body: data.body || "",
      cover_image_path: data.cover_image_path || "",
      outbound_url: data.outbound_url || "",
      outbound_links: JSON.stringify(data.outbound_links || [], null, 2),
      rising_compass_score: data.rising_compass_score?.toString() || "",
      rising_compass_classification: data.rising_compass_classification || "",
      genre: data.genre || "",
      mood_tags: (data.mood_tags || []).join(", "),
      seo_title: data.seo_title || "",
      seo_description: data.seo_description || "",
      focus_keyphrase: data.focus_keyphrase || "",
      status: data.status || "draft",
      display_order: data.display_order?.toString() || "0",
    });

    if (data.type === "playlist") {
      const tRes = await fetch(`/api/admin/curation/${id}/tracks`);
      setTracks(await tRes.json());
    }
    setLoading(false);
  }, [id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- client-side data load when id changes
  useEffect(() => { fetchEntry(); }, [fetchEntry]);

  function set(field: string, value: string) {
    setForm({ ...form, [field]: value });
  }

  async function handleSave() {
    setSaving(true);
    let outboundLinks;
    try { outboundLinks = JSON.parse(form.outbound_links); } catch { outboundLinks = []; }

    await fetch(`/api/admin/curation/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        slug: form.slug || slugify(form.title),
        rising_compass_score: form.rising_compass_score ? parseFloat(form.rising_compass_score) : null,
        mood_tags: form.mood_tags ? form.mood_tags.split(",").map(t => t.trim()).filter(Boolean) : [],
        outbound_links: outboundLinks,
        display_order: parseInt(form.display_order) || 0,
        cover_image_path: form.cover_image_path || null,
        outbound_url: form.outbound_url || null,
      }),
    });

    // Save playlist track order
    if (form.type === "playlist" && tracks.length > 0) {
      await fetch(`/api/admin/curation/${id}/tracks`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tracks),
      });
    }

    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this curation entry?")) return;
    setDeleting(true);
    await fetch(`/api/admin/curation/${id}`, { method: "DELETE" });
    router.push("/admin/curation");
  }

  async function addTrack() {
    if (!newTrack.track_title.trim() || !newTrack.artist_name.trim()) return;
    const res = await fetch(`/api/admin/curation/${id}/tracks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newTrack,
        rising_compass_score: newTrack.rising_compass_score ? parseFloat(newTrack.rising_compass_score) : null,
        display_order: tracks.length,
      }),
    });
    if (res.ok) {
      const saved = await res.json();
      setTracks([...tracks, saved]);
      setNewTrack({ track_title: "", artist_name: "", outbound_url: "", rising_compass_score: "" });
    }
  }

  async function removeTrack(trackId: string) {
    await fetch(`/api/admin/curation/${id}/tracks?trackId=${trackId}`, { method: "DELETE" });
    setTracks(tracks.filter(t => t.id !== trackId));
  }

  function moveTrack(index: number, dir: -1 | 1) {
    const swapIndex = index + dir;
    if (swapIndex < 0 || swapIndex >= tracks.length) return;
    const next = [...tracks];
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    setTracks(next.map((t, i) => ({ ...t, display_order: i })));
  }

  if (loading) return <div className="admin-page"><p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p></div>;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Edit Curation Entry</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="admin-btn admin-btn--primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
          <button className="admin-btn admin-btn--danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
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
        <input className="obsv-editor__input" value={form.slug} onChange={e => set("slug", e.target.value)} />
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
        <input className="obsv-editor__input" value={form.cover_image_path} onChange={e => set("cover_image_path", e.target.value)} />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Primary Listen Link</label>
        <input className="obsv-editor__input" value={form.outbound_url} onChange={e => set("outbound_url", e.target.value)} />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Additional Platform Links (JSON)</label>
        <textarea className="obsv-editor__input" value={form.outbound_links} onChange={e => set("outbound_links", e.target.value)} rows={4} placeholder='[{"platform": "Apple Music", "url": "https://..."}]' style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)" }} />
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
        <input className="obsv-editor__input" value={form.mood_tags} onChange={e => set("mood_tags", e.target.value)} />
      </div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Display Order</label>
        <input className="obsv-editor__input" type="number" value={form.display_order} onChange={e => set("display_order", e.target.value)} />
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

      {/* Playlist Track Management (9B.3) */}
      {form.type === "playlist" && (
        <div style={{ marginTop: "var(--space-2xl)", borderTop: "1px solid var(--border-subtle)", paddingTop: "var(--space-xl)" }}>
          <h2 style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "var(--space-md)" }}>Playlist Tracks</h2>

          {tracks.map((t, i) => (
            <div key={t.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, padding: "8px 12px", background: "var(--bg-elevated)", borderRadius: 6 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-tertiary)", minWidth: 24 }}>{i + 1}</span>
              <span style={{ flex: 1, fontSize: "var(--text-sm)" }}>{t.track_title}</span>
              <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>{t.artist_name}</span>
              {t.rising_compass_score != null && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-xs)", color: "var(--text-accent)" }}>{t.rising_compass_score}</span>
              )}
              <button onClick={() => moveTrack(i, -1)} disabled={i === 0} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "var(--text-sm)" }}>↑</button>
              <button onClick={() => moveTrack(i, 1)} disabled={i === tracks.length - 1} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "var(--text-sm)" }}>↓</button>
              <button onClick={() => removeTrack(t.id)} style={{ background: "none", border: "none", color: "#e55", cursor: "pointer", fontSize: "var(--text-sm)" }}>×</button>
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, marginTop: "var(--space-md)", flexWrap: "wrap" }}>
            <input className="obsv-editor__input" placeholder="Track title" value={newTrack.track_title} onChange={e => setNewTrack({ ...newTrack, track_title: e.target.value })} style={{ flex: 2, minWidth: 160 }} />
            <input className="obsv-editor__input" placeholder="Artist" value={newTrack.artist_name} onChange={e => setNewTrack({ ...newTrack, artist_name: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
            <input className="obsv-editor__input" placeholder="Listen URL" value={newTrack.outbound_url} onChange={e => setNewTrack({ ...newTrack, outbound_url: e.target.value })} style={{ flex: 2, minWidth: 160 }} />
            <input className="obsv-editor__input" placeholder="RC" type="number" step="0.01" value={newTrack.rising_compass_score} onChange={e => setNewTrack({ ...newTrack, rising_compass_score: e.target.value })} style={{ width: 70 }} />
            <button className="admin-btn admin-btn--secondary" onClick={addTrack}>Add</button>
          </div>
        </div>
      )}
    </div>
  );
}
