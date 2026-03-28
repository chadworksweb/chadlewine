"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function EditVideoPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetch(`/api/admin/videos/${id}`).then(r => r.json()).then(setForm); }, [id]);

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    await fetch(`/api/admin/videos/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this video?")) return;
    await fetch(`/api/admin/videos/${id}`, { method: "DELETE" });
    router.push("/admin/videos");
  }

  if (!form) return <div className="admin-page"><p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p></div>;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Edit Video</h1>
        <div style={{ display: "flex", gap: 8 }}><button className="admin-btn admin-btn--danger" onClick={handleDelete}>Delete</button><button className="admin-btn admin-btn--primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</button></div>
      </div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Title</label><input className="obsv-editor__input" value={(form.title as string) || ""} onChange={e => setForm({...form, title: e.target.value})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Embed URL</label><input className="obsv-editor__input" value={(form.embed_url as string) || ""} onChange={e => setForm({...form, embed_url: e.target.value || null})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Bunny Stream ID</label><input className="obsv-editor__input" value={(form.stream_id as string) || ""} onChange={e => setForm({...form, stream_id: e.target.value || null})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Description</label><textarea className="obsv-editor__input" value={(form.description as string) || ""} onChange={e => setForm({...form, description: e.target.value})} rows={3} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label"><input type="checkbox" checked={!!form.is_featured} onChange={e => setForm({...form, is_featured: e.target.checked})} style={{ marginRight: 8 }} />Featured</label></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Status</label><select className="obsv-editor__input" value={(form.status as string) || "draft"} onChange={e => setForm({...form, status: e.target.value})}><option value="draft">Draft</option><option value="published">Published</option></select></div>
    </div>
  );
}
