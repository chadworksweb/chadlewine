"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function EditTrackPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetch(`/api/admin/tracks/${id}`).then(r => r.json()).then(setForm); }, [id]);

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    await fetch(`/api/admin/tracks/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this track?")) return;
    await fetch(`/api/admin/tracks/${id}`, { method: "DELETE" });
    router.push("/admin/music");
  }

  if (!form) return <div className="admin-page"><p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p></div>;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Edit Track</h1>
        <div style={{ display: "flex", gap: 8 }}><button className="admin-btn admin-btn--danger" onClick={handleDelete}>Delete</button><button className="admin-btn admin-btn--primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</button></div>
      </div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Title</label><input className="obsv-editor__input" value={(form.title as string) || ""} onChange={e => setForm({...form, title: e.target.value})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Track Number</label><input className="obsv-editor__input" type="number" value={(form.track_number as number) || 1} onChange={e => setForm({...form, track_number: parseInt(e.target.value) || 1})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Streaming Path</label><input className="obsv-editor__input" value={(form.streaming_path as string) || ""} onChange={e => setForm({...form, streaming_path: e.target.value || null})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Lyrics</label><textarea className="obsv-editor__input" value={(form.lyrics as string) || ""} onChange={e => setForm({...form, lyrics: e.target.value})} rows={10} style={{ fontFamily: "monospace" }} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Price (cents)</label><input className="obsv-editor__input" type="number" value={(form.price_cents as number) || ""} onChange={e => setForm({...form, price_cents: e.target.value ? parseInt(e.target.value) : null})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Status</label><select className="obsv-editor__input" value={(form.status as string) || "draft"} onChange={e => setForm({...form, status: e.target.value})}><option value="draft">Draft</option><option value="published">Published</option></select></div>
    </div>
  );
}
