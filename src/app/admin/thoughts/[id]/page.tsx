"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function EditThoughtPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/admin/thoughts/${id}`).then((r) => r.json()).then(setForm).catch(() => setError("Not found"));
  }, [id]);

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    const res = await fetch(`/api/admin/thoughts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) setError((await res.json()).error);
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this thought?")) return;
    await fetch(`/api/admin/thoughts/${id}`, { method: "DELETE" });
    router.push("/admin/thoughts");
  }

  if (!form) {
    return <div className="admin-page"><p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>{error || "Loading..."}</p></div>;
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Edit Thought</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="admin-btn admin-btn--danger" onClick={handleDelete}>Delete</button>
          <button className="admin-btn admin-btn--primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
      {error && <p className="obsv-editor__error">{error}</p>}
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Title</label>
        <input className="obsv-editor__input" value={(form.title as string) || ""} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      </div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Slug</label>
        <input className="obsv-editor__input" value={(form.slug as string) || ""} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
      </div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Description</label>
        <textarea className="obsv-editor__input" value={(form.description as string) || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
      </div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Status</label>
        <select className="obsv-editor__input" value={(form.status as string) || "draft"} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </div>
    </div>
  );
}
