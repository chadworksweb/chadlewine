"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/utils";

export default function NewThoughtPage() {
  const router = useRouter();
  const [form, setForm] = useState({ title: "", slug: "", description: "", status: "draft" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!form.title.trim()) { setError("Title required"); return; }
    setSaving(true);
    const res = await fetch("/api/admin/thoughts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, slug: form.slug || slugify(form.title) }),
    });
    if (!res.ok) { setError((await res.json()).error); setSaving(false); return; }
    const saved = await res.json();
    router.push(`/admin/thoughts/${saved.id}`);
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">New Thought</h1>
        <button className="admin-btn admin-btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
      {error && <p className="obsv-editor__error">{error}</p>}
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Title</label>
        <input className="obsv-editor__input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Slug</label>
        <input className="obsv-editor__input" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder={form.title ? slugify(form.title) : "auto"} />
      </div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Description</label>
        <textarea className="obsv-editor__input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
      </div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Status</label>
        <select className="obsv-editor__input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </div>
    </div>
  );
}
