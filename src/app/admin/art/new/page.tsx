"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/utils";
import { MediaLibrary } from "@/components/MediaLibrary";

export default function NewArtPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    title: "", slug: "", medium: "", image_path: "", image_alt: "", description: "", status: "draft",
    dimensions: "", year_created: "", price: "", sold: false, buy_original_url: "", gallery_paths: [] as string[],
  });
  const [saving, setSaving] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);

  async function handleSave() {
    if (!form.title.trim() || !form.image_path.trim()) return;
    setSaving(true);
    const payload = {
      ...form,
      slug: form.slug || slugify(form.title),
      year_created: form.year_created ? parseInt(form.year_created) : null,
      price: form.price ? parseFloat(form.price) : null,
    };
    const res = await fetch("/api/admin/art", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (res.ok) { const saved = await res.json(); router.push(`/admin/art/${saved.slug}`); }
    setSaving(false);
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header"><h1 className="admin-page__title">New Art Piece</h1><button className="admin-btn admin-btn--primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</button></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Title</label><input className="obsv-editor__input" value={form.title} onChange={e => setForm({...form, title: e.target.value})} /></div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Image</label>
        {form.image_path ? (
          <div className="cover-art-preview">
            <img src={form.image_path} alt={form.image_alt || "Art preview"} className="cover-art-preview__img" />
            <div className="cover-art-preview__actions">
              <button type="button" className="admin-btn admin-btn--primary" onClick={() => setMediaOpen(true)} style={{ fontSize: "0.6875rem", padding: "4px 12px" }}>Replace</button>
              <button type="button" className="admin-btn admin-btn--danger" onClick={() => setForm({ ...form, image_path: "" })} style={{ fontSize: "0.6875rem", padding: "4px 12px" }}>Remove</button>
            </div>
          </div>
        ) : (
          <button type="button" className="cover-art-upload" onClick={() => setMediaOpen(true)}>Choose Image</button>
        )}
      </div>
      <MediaLibrary
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        onSelect={(url: string, alt?: string) => {
          setForm((f) => ({ ...f, image_path: url, image_alt: alt && !f.image_alt ? alt : f.image_alt }));
          setMediaOpen(false);
        }}
      />
      <div className="obsv-editor__field"><label className="obsv-editor__label">Image Alt</label><input className="obsv-editor__input" value={form.image_alt} onChange={e => setForm({...form, image_alt: e.target.value})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Medium</label><input className="obsv-editor__input" value={form.medium} onChange={e => setForm({...form, medium: e.target.value})} placeholder="Digital, Acrylic, etc." /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Dimensions</label><input className="obsv-editor__input" value={form.dimensions} onChange={e => setForm({...form, dimensions: e.target.value})} placeholder="e.g. 24×30 in" /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Year</label><input className="obsv-editor__input" type="number" value={form.year_created} onChange={e => setForm({...form, year_created: e.target.value})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Price ($)</label><input className="obsv-editor__input" type="number" step="0.01" value={form.price} onChange={e => setForm({...form, price: e.target.value})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label" style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={form.sold} onChange={e => setForm({...form, sold: e.target.checked})} /> Sold</label></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Buy Original URL</label><input className="obsv-editor__input" value={form.buy_original_url} onChange={e => setForm({...form, buy_original_url: e.target.value})} placeholder="External marketplace link (optional)" /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Gallery URLs (one per line)</label><textarea className="obsv-editor__input" rows={4} value={form.gallery_paths.join("\n")} onChange={e => setForm({...form, gallery_paths: e.target.value.split("\n").map(s => s.trim()).filter(Boolean)})} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Description</label><textarea className="obsv-editor__input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} rows={3} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Status</label><select className="obsv-editor__input" value={form.status} onChange={e => setForm({...form, status: e.target.value})}><option value="draft">Draft</option><option value="published">Published</option></select></div>
    </div>
  );
}
