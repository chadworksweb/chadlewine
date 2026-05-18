"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/utils";

export default function NewReleasePage() {
  const router = useRouter();
  const [form, setForm] = useState({ title: "", slug: "", release_date: "", description: "", status: "draft" });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!form.title.trim()) return;
    setSaving(true);
    const res = await fetch("/api/admin/releases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, slug: form.slug || slugify(form.title), release_date: form.release_date || null }) });
    if (res.ok) { const saved = await res.json(); router.push(`/admin/music/releases/${saved.slug || saved.id}`); }
    setSaving(false);
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header"><h1 className="admin-page__title">New Release</h1><button className="admin-btn admin-btn--primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</button></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Title</label><input className="obsv-editor__input" value={form.title} onChange={e => setForm({...form, title: e.target.value})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Slug</label><input className="obsv-editor__input" value={form.slug} onChange={e => setForm({...form, slug: e.target.value})} placeholder={form.title ? slugify(form.title) : "auto"} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Release Date</label><input className="obsv-editor__input" type="date" value={form.release_date} onChange={e => setForm({...form, release_date: e.target.value})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Description</label><textarea className="obsv-editor__input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={3} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Status</label><select className="obsv-editor__input" value={form.status} onChange={e => setForm({...form, status: e.target.value})}><option value="draft">Draft</option><option value="unreleased">Unreleased</option><option value="published">Published</option></select></div>
    </div>
  );
}
