"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/utils";

export default function NewArtPage() {
  const router = useRouter();
  const [form, setForm] = useState({ title: "", slug: "", medium: "", image_path: "", image_alt: "", description: "", status: "draft" });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!form.title.trim() || !form.image_path.trim()) return;
    setSaving(true);
    const res = await fetch("/api/admin/art", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, slug: form.slug || slugify(form.title) }) });
    if (res.ok) { const saved = await res.json(); router.push(`/admin/art/${saved.id}`); }
    setSaving(false);
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header"><h1 className="admin-page__title">New Art Piece</h1><button className="admin-btn admin-btn--primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</button></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Title</label><input className="obsv-editor__input" value={form.title} onChange={e => setForm({...form, title: e.target.value})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Image Path</label><input className="obsv-editor__input" value={form.image_path} onChange={e => setForm({...form, image_path: e.target.value})} placeholder="Supabase Storage URL" /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Image Alt</label><input className="obsv-editor__input" value={form.image_alt} onChange={e => setForm({...form, image_alt: e.target.value})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Medium</label><input className="obsv-editor__input" value={form.medium} onChange={e => setForm({...form, medium: e.target.value})} placeholder="Digital, Acrylic, etc." /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Description</label><textarea className="obsv-editor__input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={3} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Status</label><select className="obsv-editor__input" value={form.status} onChange={e => setForm({...form, status: e.target.value})}><option value="draft">Draft</option><option value="published">Published</option></select></div>
    </div>
  );
}
