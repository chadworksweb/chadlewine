"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function EditAlbumPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [tracks, setTracks] = useState<{ id: string; title: string; track_number: number; status: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/albums/${id}`).then(r => r.json()),
      fetch(`/api/admin/tracks?album_id=${id}`).then(r => r.json()),
    ]).then(([album, trks]) => { setForm(album); setTracks(trks); });
  }, [id]);

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    await fetch(`/api/admin/albums/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm("Delete album and all tracks?")) return;
    await fetch(`/api/admin/albums/${id}`, { method: "DELETE" });
    router.push("/admin/music");
  }

  if (!form) return <div className="admin-page"><p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p></div>;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Edit Album</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="admin-btn admin-btn--danger" onClick={handleDelete}>Delete</button>
          <button className="admin-btn admin-btn--primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Title</label><input className="obsv-editor__input" value={(form.title as string) || ""} onChange={e => setForm({...form, title: e.target.value})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Slug</label><input className="obsv-editor__input" value={(form.slug as string) || ""} onChange={e => setForm({...form, slug: e.target.value})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Release Date</label><input className="obsv-editor__input" type="date" value={(form.release_date as string) || ""} onChange={e => setForm({...form, release_date: e.target.value || null})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Status</label><select className="obsv-editor__input" value={(form.status as string) || "draft"} onChange={e => setForm({...form, status: e.target.value})}><option value="draft">Draft</option><option value="published">Published</option></select></div>

      <h2 style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "var(--space-xl) 0 var(--space-md)" }}>Tracks</h2>
      <Link href={`/admin/music/tracks/new?album_id=${id}`} className="admin-btn admin-btn--secondary" style={{ marginBottom: "var(--space-md)", display: "inline-block" }}>Add Track</Link>
      <table className="admin-table">
        <thead><tr><th className="admin-table__th">#</th><th className="admin-table__th">Title</th><th className="admin-table__th">Status</th></tr></thead>
        <tbody>
          {tracks.sort((a, b) => a.track_number - b.track_number).map(t => (
            <tr key={t.id} className="admin-table__row">
              <td className="admin-table__td">{t.track_number}</td>
              <td className="admin-table__td"><Link href={`/admin/music/tracks/${t.id}`} className="admin-table__link">{t.title}</Link></td>
              <td className="admin-table__td"><span className={`admin-status admin-status--${t.status}`}>{t.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
