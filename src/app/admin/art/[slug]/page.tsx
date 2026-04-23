"use client";
import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { FocalPointPicker, type CropRatio, type CropPatch } from "@/components/FocalPointPicker";
import { ArtGalleryManager } from "@/components/ArtGalleryManager";
import { ArtVariantsManager } from "@/components/ArtVariantsManager";
import { FeaturedPicker } from "@/components/FeaturedPicker";
import { MuralDetailsEditor } from "@/components/MuralDetailsEditor";

type Form = Record<string, unknown>;
type ArtFormat = { id: string; slug: string; label: string };

export default function EditArtPage() {
  const { slug } = useParams() as { slug: string };
  const router = useRouter();
  const [form, setForm] = useState<Form | null>(null);
  const [formats, setFormats] = useState<ArtFormat[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetch(`/api/admin/art/${slug}`).then(r => r.json()).then(setForm); }, [slug]);
  useEffect(() => { fetch(`/api/admin/art-formats`).then(r => r.json()).then(setFormats).catch(() => setFormats([])); }, []);

  async function handleSave() {
    if (!form) return;
    setSaving(true);
    const res = await fetch(`/api/admin/art/${slug}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    if (res.ok) {
      const saved = await res.json();
      if (saved?.slug && saved.slug !== slug) {
        router.replace(`/admin/art/${saved.slug}`);
      }
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this art piece?")) return;
    await fetch(`/api/admin/art/${slug}`, { method: "DELETE" });
    router.push("/admin/art");
  }

  if (!form) return <div className="admin-page"><p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p></div>;

  const val = (k: string): string => (form[k] as string | null | undefined) ?? "";
  const num = (k: string): number | "" => {
    const v = form[k];
    return typeof v === "number" ? v : "";
  };
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const jsonArray = (k: string): string[] => (Array.isArray(form[k]) ? (form[k] as string[]) : []);
  const numOrNull = (k: string): number | null => (typeof form[k] === "number" ? (form[k] as number) : null);

  const secondary = jsonArray("secondary_keyphrases");
  const entities = jsonArray("entity_tags");
  const paa = Array.isArray(form.paa_pairs) ? (form.paa_pairs as { question: string; answer: string }[]) : [];

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Edit Art Piece</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="admin-btn" href={`/art/${slug}`} target="_blank" rel="noreferrer">View</a>
          <a className="admin-btn" href={`/admin/art/${slug}/composition`}>Composition</a>
          <button className="admin-btn admin-btn--danger" onClick={handleDelete}>Delete</button>
          <button className="admin-btn admin-btn--primary" onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
        </div>
      </div>

      <h2 className="admin-page__section-title">Basics</h2>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Title</label><input className="obsv-editor__input" value={val("title")} onChange={e => set({ title: e.target.value })} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Slug</label><input className="obsv-editor__input" value={val("slug")} onChange={e => set({ slug: e.target.value })} /></div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Format</label>
        <select className="obsv-editor__input" value={val("format_id")} onChange={e => set({ format_id: e.target.value || null })}>
          <option value="">—</option>
          {formats.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Status</label><select className="obsv-editor__input" value={val("status") || "draft"} onChange={e => set({ status: e.target.value })}><option value="draft">Draft</option><option value="unreleased">Unreleased</option><option value="published">Published</option></select></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Display Order</label><input className="obsv-editor__input" type="number" value={num("display_order") || 0} onChange={e => set({ display_order: parseInt(e.target.value) || 0 })} /></div>

      <h2 className="admin-page__section-title">Image</h2>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Image Path</label><input className="obsv-editor__input" value={val("image_path")} onChange={e => set({ image_path: e.target.value })} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Image Alt</label><input className="obsv-editor__input" value={val("image_alt")} onChange={e => set({ image_alt: e.target.value })} /></div>
      {val("image_path") && (
        <div className="obsv-editor__field" style={{ maxWidth: 420 }}>
          <FocalPointPicker
            src={val("image_path")}
            alt={val("image_alt") || val("title")}
            crops={{
              hero: { focalX: numOrNull("hero_focal_x"), focalY: numOrNull("hero_focal_y"), zoom: numOrNull("hero_zoom") },
              card: { focalX: numOrNull("card_focal_x"), focalY: numOrNull("card_focal_y"), zoom: numOrNull("card_zoom") },
              portrait: { focalX: numOrNull("portrait_focal_x"), focalY: numOrNull("portrait_focal_y"), zoom: numOrNull("portrait_zoom") },
            }}
            onChange={(ratio: CropRatio, patch: CropPatch) => {
              const updates: Record<string, unknown> = {};
              if ("focalX" in patch) updates[`${ratio}_focal_x`] = patch.focalX;
              if ("focalY" in patch) updates[`${ratio}_focal_y`] = patch.focalY;
              if ("zoom" in patch) updates[`${ratio}_zoom`] = patch.zoom ?? 1;
              set(updates);
            }}
          />
        </div>
      )}
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Additional Gallery Images</label>
        <ArtGalleryManager
          paths={jsonArray("gallery_paths")}
          onChange={(next) => set({ gallery_paths: next })}
        />
      </div>

      <h2 className="admin-page__section-title">Meta</h2>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Medium</label><input className="obsv-editor__input" value={val("medium")} onChange={e => set({ medium: e.target.value })} placeholder="e.g. Acrylic on canvas" /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Dimensions</label><input className="obsv-editor__input" value={val("dimensions")} onChange={e => set({ dimensions: e.target.value })} placeholder="e.g. 24×30 in" /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Year</label><input className="obsv-editor__input" type="number" value={num("year_created") || ""} onChange={e => set({ year_created: e.target.value ? parseInt(e.target.value) : null })} /></div>

      <h2 className="admin-page__section-title">Narrative</h2>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Art Summary (1–2 sentences — used in cards, meta descriptions)</label><textarea className="obsv-editor__input" rows={2} value={val("art_summary")} onChange={e => set({ art_summary: e.target.value })} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Description (longer-form)</label><textarea className="obsv-editor__input" rows={5} value={val("description")} onChange={e => set({ description: e.target.value })} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Chad Quote</label><textarea className="obsv-editor__input" rows={2} value={val("chad_quote")} onChange={e => set({ chad_quote: e.target.value })} placeholder="A short line in your voice about this piece" /></div>

      {formats.find((f) => f.id === val("format_id"))?.slug === "mural" && (
        <>
          <h2 className="admin-page__section-title">Mural Details</h2>
          <MuralDetailsEditor slug={slug} />
        </>
      )}

      <h2 className="admin-page__section-title">Licensing Ideas</h2>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Direct Answer (40–60 words — one paragraph naming the 2–3 strongest placement types)</label><textarea className="obsv-editor__input" rows={3} value={val("licensing_direct_answer")} onChange={e => set({ licensing_direct_answer: e.target.value })} placeholder="e.g. This piece would land in a hospitality lobby, a boutique hotel corridor, or a lifestyle brand's editorial spread — anywhere a large-format work needs to set an emotional tone without competing for the viewer's focus." /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Prose (markdown — expand on scene/space shape, reference styles or brands when useful)</label><textarea className="obsv-editor__input" rows={6} value={val("licensing_content")} onChange={e => set({ licensing_content: e.target.value })} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Placement Scenarios (one per line — concrete searchable phrases)</label><textarea className="obsv-editor__input" rows={5} value={jsonArray("licensing_key_points").join("\n")} onChange={e => set({ licensing_key_points: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) })} placeholder={"Editorial spread for a travel or lifestyle magazine\nBook cover for a literary fiction imprint\nLobby wall for a boutique hotel\nBrand environment for a premium hospitality group"} /></div>

      <h2 className="admin-page__section-title">Variants / Products</h2>
      <ArtVariantsManager slug={slug} />

      <h2 className="admin-page__section-title">Songs you might like (shown on art detail page)</h2>
      <FeaturedPicker kind="song" parentRef={slug} />

      <h2 className="admin-page__section-title">Other art you might like (shown on art detail page)</h2>
      <FeaturedPicker kind="art" parentKind="art" parentRef={slug} excludeSlug={slug} />

      <h2 className="admin-page__section-title">GEO / SEO</h2>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Focus Keyphrase</label><input className="obsv-editor__input" value={val("focus_keyphrase")} onChange={e => set({ focus_keyphrase: e.target.value })} maxLength={80} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Secondary Keyphrases (one per line)</label><textarea className="obsv-editor__input" rows={3} value={secondary.join("\n")} onChange={e => set({ secondary_keyphrases: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) })} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Search Intent</label><select className="obsv-editor__input" value={val("search_intent") || "informational"} onChange={e => set({ search_intent: e.target.value })}><option value="informational">Informational</option><option value="navigational">Navigational</option><option value="commercial">Commercial</option></select></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Citation Summary (40–60 words, fact-check / sourcing)</label><textarea className="obsv-editor__input" rows={3} value={val("citation_summary")} onChange={e => set({ citation_summary: e.target.value })} maxLength={300} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">SEO Title (overrides default)</label><input className="obsv-editor__input" value={val("seo_title")} onChange={e => set({ seo_title: e.target.value })} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">SEO Description</label><textarea className="obsv-editor__input" rows={2} value={val("seo_description")} onChange={e => set({ seo_description: e.target.value })} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Entity Tags (one per line — named entities referenced)</label><textarea className="obsv-editor__input" rows={3} value={entities.join("\n")} onChange={e => set({ entity_tags: e.target.value.split("\n").map(s => s.trim()).filter(Boolean) })} /></div>

      <h2 className="admin-page__section-title">People Also Ask (Q&amp;A pairs)</h2>
      {paa.map((p, i) => (
        <div key={i} className="obsv-editor__field" style={{ border: "1px solid var(--border-subtle, #2a2a35)", padding: "var(--space-sm)", borderRadius: 6, marginBottom: "var(--space-xs)" }}>
          <input className="obsv-editor__input" value={p.question} placeholder="Question" onChange={e => {
            const next = [...paa]; next[i] = { ...next[i], question: e.target.value };
            set({ paa_pairs: next });
          }} />
          <textarea className="obsv-editor__input" rows={2} value={p.answer} placeholder="Answer" onChange={e => {
            const next = [...paa]; next[i] = { ...next[i], answer: e.target.value };
            set({ paa_pairs: next });
          }} style={{ marginTop: 4 }} />
          <button type="button" className="admin-btn admin-btn--small admin-btn--danger" onClick={() => set({ paa_pairs: paa.filter((_, j) => j !== i) })} style={{ marginTop: 4 }}>Remove</button>
        </div>
      ))}
      <button type="button" className="admin-btn admin-btn--small" onClick={() => set({ paa_pairs: [...paa, { question: "", answer: "" }] })}>+ Add PAA pair</button>
    </div>
  );
}
