"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function EditArtPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetch(`/api/admin/art/${id}`).then(r => r.json()).then(setForm); }, [id]);

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    await fetch(`/api/admin/art/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this art piece?")) return;
    await fetch(`/api/admin/art/${id}`, { method: "DELETE" });
    router.push("/admin/art");
  }

  if (!form) return <div className="admin-page"><p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p></div>;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Edit Art Piece</h1>
        <div style={{ display: "flex", gap: 8 }}><button className="admin-btn admin-btn--danger" onClick={handleDelete}>Delete</button><button className="admin-btn admin-btn--primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</button></div>
      </div>
      {typeof form.image_path === "string" && form.image_path && <img src={form.image_path} alt={(form.image_alt as string) || ""} style={{ maxWidth: 300, borderRadius: 8, marginBottom: "var(--space-md)" }} />}
      <div className="obsv-editor__field"><label className="obsv-editor__label">Title</label><input className="obsv-editor__input" value={(form.title as string) || ""} onChange={e => setForm({...form, title: e.target.value})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Image Path</label><input className="obsv-editor__input" value={(form.image_path as string) || ""} onChange={e => setForm({...form, image_path: e.target.value})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Medium</label><input className="obsv-editor__input" value={(form.medium as string) || ""} onChange={e => setForm({...form, medium: e.target.value})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Display Order</label><input className="obsv-editor__input" type="number" value={(form.display_order as number) || 0} onChange={e => setForm({...form, display_order: parseInt(e.target.value) || 0})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Status</label><select className="obsv-editor__input" value={(form.status as string) || "draft"} onChange={e => setForm({...form, status: e.target.value})}><option value="draft">Draft</option><option value="published">Published</option></select></div>
    </div>
  );
}
