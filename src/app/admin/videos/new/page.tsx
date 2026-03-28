"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/utils";

export default function NewVideoPage() {
  const router = useRouter();
  const [form, setForm] = useState({ title: "", slug: "", embed_url: "", stream_id: "", description: "", is_featured: false, status: "draft" });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/admin/videos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, slug: form.slug || slugify(form.title) }) });
    if (res.ok) { const saved = await res.json(); router.push(`/admin/videos/${saved.id}`); }
    setSaving(false);
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header"><h1 className="admin-page__title">New Video</h1><button className="admin-btn admin-btn--primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</button></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Title</label><input className="obsv-editor__input" value={form.title} onChange={e => setForm({...form, title: e.target.value})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Embed URL</label><input className="obsv-editor__input" value={form.embed_url} onChange={e => setForm({...form, embed_url: e.target.value})} placeholder="https://youtube.com/embed/..." /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Bunny Stream ID</label><input className="obsv-editor__input" value={form.stream_id} onChange={e => setForm({...form, stream_id: e.target.value})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Description</label><textarea className="obsv-editor__input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={3} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label"><input type="checkbox" checked={form.is_featured} onChange={e => setForm({...form, is_featured: e.target.checked})} style={{ marginRight: 8 }} />Featured</label></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Status</label><select className="obsv-editor__input" value={form.status} onChange={e => setForm({...form, status: e.target.value})}><option value="draft">Draft</option><option value="published">Published</option></select></div>
    </div>
  );
}
