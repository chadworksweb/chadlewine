"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { slugify } from "@/lib/utils";
import { Suspense } from "react";

function NewTrackForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetAlbum = searchParams.get("album_id") || "";
  const [albums, setAlbums] = useState<{ id: string; title: string }[]>([]);
  const [form, setForm] = useState({ title: "", slug: "", album_id: presetAlbum, track_number: "1", lyrics: "", streaming_path: "", price_cents: "", status: "draft" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetch("/api/admin/albums").then(r => r.json()).then(setAlbums); }, []);

  async function handleSave() {
    if (!form.title.trim() || !form.album_id) return;
    setSaving(true);
    const res = await fetch("/api/admin/tracks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, slug: form.slug || slugify(form.title), track_number: parseInt(form.track_number) || 1, price_cents: form.price_cents ? parseInt(form.price_cents) : null }) });
    if (res.ok) { const saved = await res.json(); router.push(`/admin/music/tracks/${saved.id}`); }
    setSaving(false);
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header"><h1 className="admin-page__title">New Track</h1><button className="admin-btn admin-btn--primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</button></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Album</label><select className="obsv-editor__input" value={form.album_id} onChange={e => setForm({...form, album_id: e.target.value})}><option value="">Select album...</option>{albums.map(a => <option key={a.id} value={a.id}>{a.title}</option>)}</select></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Title</label><input className="obsv-editor__input" value={form.title} onChange={e => setForm({...form, title: e.target.value})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Track Number</label><input className="obsv-editor__input" type="number" value={form.track_number} onChange={e => setForm({...form, track_number: e.target.value})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Streaming Path (Bunny CDN)</label><input className="obsv-editor__input" value={form.streaming_path} onChange={e => setForm({...form, streaming_path: e.target.value})} placeholder="https://cdn.bunny.net/..." /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Lyrics</label><textarea className="obsv-editor__input" value={form.lyrics} onChange={e => setForm({...form, lyrics: e.target.value})} rows={10} style={{ fontFamily: "monospace" }} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Price (cents)</label><input className="obsv-editor__input" type="number" value={form.price_cents} onChange={e => setForm({...form, price_cents: e.target.value})} placeholder="99" /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Status</label><select className="obsv-editor__input" value={form.status} onChange={e => setForm({...form, status: e.target.value})}><option value="draft">Draft</option><option value="published">Published</option></select></div>
    </div>
  );
}

export default function NewTrackPage() {
  return <Suspense fallback={<div className="admin-page"><p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p></div>}><NewTrackForm /></Suspense>;
}
