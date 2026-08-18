"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { SeoFieldsPanel } from "@/components/SeoFieldsPanel";
import { FocalPointPicker, type CropRatio, type CropPatch } from "@/components/FocalPointPicker";

// timestamptz (ISO) <-> the value a datetime-local input expects (local time).
function toLocalInput(iso: unknown): string {
  if (typeof iso !== "string" || !iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(val: string): string | null {
  if (!val) return null;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function EditVideoPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [songs, setSongs] = useState<Array<{ id: string; title: string }>>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetch(`/api/admin/videos/${id}`).then(r => r.json()).then(setForm); }, [id]);
  useEffect(() => {
    fetch("/api/admin/songs")
      .then(r => r.json())
      .then((rows: Array<{ id: string; title: string }>) =>
        setSongs([...rows].sort((a, b) => a.title.localeCompare(b.title))));
  }, []);

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
      <div style={{ marginTop: "1.5rem" }}>
        <SeoFieldsPanel
          seoTitle={(form.seo_title as string) || ""}
          seoDescription={(form.seo_description as string) || ""}
          defaultTitle={`${(form.title as string) || "Untitled"} — Music Video — Chad Lewine`}
          descriptionFallbackHint="the video description"
          urlBreadcrumb="videos"
          onChange={(field, value) => setForm({ ...form, [field]: value })}
        />
      </div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Song this video is of</label><select className="obsv-editor__input" value={(form.song_id as string) || ""} onChange={e => setForm({...form, song_id: e.target.value || null})}><option value="">-- none --</option>{songs.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}</select><p style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", margin: "4px 0 0" }}>Links the video to its catalog song (about/subjectOf in structured data).</p></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label"><input type="checkbox" checked={!!form.is_featured} onChange={e => setForm({...form, is_featured: e.target.checked})} style={{ marginRight: 8 }} />Featured</label></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Status</label><select className="obsv-editor__input" value={(form.status as string) || "draft"} onChange={e => setForm({...form, status: e.target.value})}><option value="draft">Draft</option><option value="published">Published</option></select></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Publish date</label><input type="datetime-local" className="obsv-editor__input" value={toLocalInput(form.published_at)} onChange={e => setForm({...form, published_at: fromLocalInput(e.target.value)})} /><p style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", margin: "4px 0 0" }}>Controls newest/oldest sort order on the public page.</p></div>

      {typeof form.thumbnail_path === "string" && form.thumbnail_path && (
        <div className="obsv-editor__panel">
          <h3 className="obsv-editor__panel-title">Homepage hero crop &amp; focal point</h3>
          <FocalPointPicker
            src={form.thumbnail_path}
            alt={(form.title as string) || "Video thumbnail"}
            ratios={["hero"]}
            crops={{
              hero: {
                focalX: (form.hero_focal_x as number | null) ?? null,
                focalY: (form.hero_focal_y as number | null) ?? null,
                zoom: (form.hero_zoom as number | null) ?? 1,
              },
              card: { focalX: null, focalY: null, zoom: 1 },
              portrait: { focalX: null, focalY: null, zoom: 1 },
            }}
            onChange={(ratio: CropRatio, patch: CropPatch) => {
              if (ratio !== "hero") return;
              const updates: Record<string, unknown> = {};
              if ("focalX" in patch) updates.hero_focal_x = patch.focalX;
              if ("focalY" in patch) updates.hero_focal_y = patch.focalY;
              if ("zoom" in patch) updates.hero_zoom = patch.zoom ?? 1;
              setForm({ ...form, ...updates });
            }}
          />
        </div>
      )}
    </div>
  );
}
