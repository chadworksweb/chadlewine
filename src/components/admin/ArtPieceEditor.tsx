"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/utils";
import { FocalPointPicker, type CropRatio, type CropPatch } from "@/components/FocalPointPicker";
import { ArtGalleryManager } from "@/components/ArtGalleryManager";
import { ArtVariantsManager } from "@/components/ArtVariantsManager";
import { ArtSkuPanel } from "@/components/admin/ArtSkuPanel";
import { EntityPicker } from "@/components/EntityPicker";
import { MuralDetailsEditor } from "@/components/MuralDetailsEditor";
import { MediaLibrary } from "@/components/MediaLibrary";

type Form = Record<string, unknown>;
type ArtFormat = { id: string; slug: string; label: string };
type Status = "idle" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 800;

const EMPTY: Form = {
  title: "",
  slug: "",
  medium: "",
  image_path: "",
  image_alt: "",
  description: "",
  status: "draft",
  year_created: null,
  gallery_paths: [],
  art_summary: "",
  chad_quote: "",
  display_order: 0,
  format_id: null,
  focus_keyphrase: "",
  secondary_keyphrases: [],
  search_intent: "informational",
  citation_summary: "",
  paa_pairs: [],
  entity_tags: [],
  seo_title: "",
  seo_description: "",
  licensing_direct_answer: "",
  licensing_content: "",
  licensing_key_points: [],
  hero_focal_x: null,
  hero_focal_y: null,
  hero_zoom: 1,
  card_focal_x: null,
  card_focal_y: null,
  card_zoom: 1,
  portrait_focal_x: null,
  portrait_focal_y: null,
  portrait_zoom: 1,
};

interface Props {
  /** Slug of existing art piece. Omit for the new-art flow. */
  slug?: string;
}

export function ArtPieceEditor({ slug: initialSlug }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<Form | null>(initialSlug ? null : { ...EMPTY });
  const [formats, setFormats] = useState<ArtFormat[]>([]);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Saved-state tracking: serverSlug = current URL key, lastSavedJson = last successful payload
  const serverSlug = useRef<string | null>(initialSlug || null);
  const lastSavedJson = useRef<string>("");
  const inflight = useRef(false);
  const pending = useRef(false);

  // Load existing record
  useEffect(() => {
    if (!initialSlug) return;
    fetch(`/api/admin/art/${initialSlug}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          setErrorMsg(d.error);
          return;
        }
        serverSlug.current = d.slug || initialSlug;
        const next = { ...EMPTY, ...d };
        setForm(next);
        lastSavedJson.current = JSON.stringify(buildPayloadFromForm(next));
      })
      .catch(() => setErrorMsg("Not found"));
  }, [initialSlug]);

  useEffect(() => {
    fetch(`/api/admin/art-formats`)
      .then((r) => r.json())
      .then(setFormats)
      .catch(() => setFormats([]));
  }, []);

  // Debounced autosave (POST when no serverSlug, PUT otherwise)
  useEffect(() => {
    if (!form) return;
    const title = (form.title as string | undefined)?.trim() || "";
    const imagePath = (form.image_path as string | undefined)?.trim() || "";
    if (!title || !imagePath) return;

    const payload = buildPayloadFromForm(form);
    const json = JSON.stringify(payload);
    if (json === lastSavedJson.current) return;

    const timer = setTimeout(() => {
      const fire = async () => {
        if (inflight.current) {
          pending.current = true;
          return;
        }
        inflight.current = true;
        setStatus("saving");
        try {
          const isNew = !serverSlug.current;
          const url = isNew ? "/api/admin/art" : `/api/admin/art/${serverSlug.current}`;
          const method = isNew ? "POST" : "PUT";
          const res = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: json,
          });
          if (!res.ok) {
            setStatus("error");
            return;
          }
          const saved = await res.json();
          lastSavedJson.current = json;
          const newSlug = (saved?.slug as string | undefined) ?? serverSlug.current;
          if (newSlug && newSlug !== serverSlug.current) {
            serverSlug.current = newSlug;
            router.replace(`/admin/art/${newSlug}`, { scroll: false });
          }
          setStatus("saved");
        } catch {
          setStatus("error");
        } finally {
          inflight.current = false;
          if (pending.current) {
            pending.current = false;
            fire();
          }
        }
      };
      fire();
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [form, router]);

  async function handleDelete() {
    if (!serverSlug.current) return;
    if (!confirm("Delete this art piece?")) return;
    await fetch(`/api/admin/art/${serverSlug.current}`, { method: "DELETE" });
    router.push("/admin/art");
  }

  if (!form) {
    return (
      <div className="admin-page">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>
          {errorMsg || "Loading..."}
        </p>
      </div>
    );
  }

  const isExisting = !!serverSlug.current;
  const val = (k: string): string => (form[k] as string | null | undefined) ?? "";
  const num = (k: string): number | "" => {
    const v = form[k];
    return typeof v === "number" ? v : "";
  };
  const set = (patch: Partial<Form>) => setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  const jsonArray = (k: string): string[] => (Array.isArray(form[k]) ? (form[k] as string[]) : []);
  const numOrNull = (k: string): number | null => (typeof form[k] === "number" ? (form[k] as number) : null);

  const secondary = jsonArray("secondary_keyphrases");
  const entities = jsonArray("entity_tags");
  const paa = Array.isArray(form.paa_pairs) ? (form.paa_pairs as { question: string; answer: string }[]) : [];
  const currentSlug = serverSlug.current || "";

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">{isExisting ? "Edit Art Piece" : "New Art Piece"}</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {isExisting && (
            <a className="admin-btn" href={`/art/${currentSlug}`} target="_blank" rel="noreferrer">View</a>
          )}
          {isExisting && (
            <a className="admin-btn" href={`/admin/art/${currentSlug}/composition`}>Composition</a>
          )}
          {isExisting && (
            <button className="admin-btn admin-btn--danger" onClick={handleDelete}>Delete</button>
          )}
          <span className={`autosave-status autosave-status--${status}`}>
            {status === "saving" && "Saving..."}
            {status === "saved" && "Saved"}
            {status === "error" && "Save failed"}
            {status === "idle" && !isExisting && "Add a title and image to begin"}
          </span>
        </div>
      </div>

      <h2 className="admin-page__section-title">Basics</h2>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Title</label>
        <input className="obsv-editor__input" value={val("title")} onChange={(e) => set({ title: e.target.value })} />
      </div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Slug</label>
        <input
          className="obsv-editor__input obsv-editor__input--mono"
          value={val("slug")}
          onChange={(e) => set({ slug: e.target.value })}
          placeholder={val("title") ? slugify(val("title")) : "auto-generated"}
        />
      </div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Format</label>
        <select className="obsv-editor__input" value={val("format_id")} onChange={(e) => set({ format_id: e.target.value || null })}>
          <option value="">—</option>
          {formats.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Status</label>
        <select className="obsv-editor__input" value={val("status") || "draft"} onChange={(e) => set({ status: e.target.value })}>
          <option value="draft">Draft</option>
          <option value="unreleased">Unreleased</option>
          <option value="published">Published</option>
        </select>
      </div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Display Order</label>
        <input className="obsv-editor__input" type="number" value={num("display_order") || 0} onChange={(e) => set({ display_order: parseInt(e.target.value) || 0 })} />
      </div>

      <h2 className="admin-page__section-title">Image</h2>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Image</label>
        {val("image_path") ? (
          <div className="cover-art-preview">
            {/* eslint-disable-next-line @next/next/no-img-element -- admin-only piece preview */}
            <img src={val("image_path")} alt={val("image_alt") || "Art preview"} className="cover-art-preview__img" />
            <div className="cover-art-preview__actions">
              <button type="button" className="admin-btn admin-btn--primary" onClick={() => setMediaOpen(true)} style={{ fontSize: "0.6875rem", padding: "4px 12px" }}>Replace</button>
              <button type="button" className="admin-btn admin-btn--danger" onClick={() => set({ image_path: "" })} style={{ fontSize: "0.6875rem", padding: "4px 12px" }}>Remove</button>
            </div>
          </div>
        ) : (
          <button type="button" className="cover-art-upload" onClick={() => setMediaOpen(true)}>Choose Image</button>
        )}
        <input className="obsv-editor__input obsv-editor__input--mono" value={val("image_path")} onChange={(e) => set({ image_path: e.target.value })} placeholder="Raw path (advanced — prefer the picker)" style={{ marginTop: 8, fontSize: "0.75rem" }} />
      </div>
      <MediaLibrary
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        onSelect={(url: string, alt?: string) => {
          const patch: Record<string, unknown> = { image_path: url };
          if (alt && !val("image_alt")) patch.image_alt = alt;
          set(patch);
          setMediaOpen(false);
        }}
      />
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Image Alt</label>
        <input className="obsv-editor__input" value={val("image_alt")} onChange={(e) => set({ image_alt: e.target.value })} />
      </div>
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
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">In-situ / on-the-wall shots (sell the scale -- the piece hung in a real room)</label>
        <ArtGalleryManager
          paths={jsonArray("in_situ_paths")}
          onChange={(next) => set({ in_situ_paths: next })}
        />
      </div>

      <h2 className="admin-page__section-title">Meta</h2>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Medium</label>
        <input className="obsv-editor__input" value={val("medium")} onChange={(e) => set({ medium: e.target.value })} placeholder="e.g. Acrylic on canvas" />
      </div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Real size in inches (drives the shown dimensions, the gallery wall, and the in-room view)</label>
        <div style={{ display: "flex", gap: 12 }}>
          {(["width_in", "height_in", "depth_in"] as const).map((f) => (
            <input
              key={f}
              className="obsv-editor__input"
              type="number"
              step="0.25"
              min="0"
              placeholder={f === "width_in" ? "W" : f === "height_in" ? "H" : "depth (opt)"}
              value={num(f) ?? ""}
              onChange={(e) => set({ [f]: e.target.value ? parseFloat(e.target.value) : null })}
            />
          ))}
        </div>
      </div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Year</label>
        <input
          className="obsv-editor__input"
          type="number"
          value={num("year_created") || ""}
          onChange={(e) => set({ year_created: e.target.value ? parseInt(e.target.value) : null })}
        />
      </div>

      <h2 className="admin-page__section-title">Narrative</h2>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Art Summary (1–2 sentences — used in cards, meta descriptions)</label>
        <textarea className="obsv-editor__input" rows={2} value={val("art_summary")} onChange={(e) => set({ art_summary: e.target.value })} />
      </div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Description (longer-form)</label>
        <textarea className="obsv-editor__input" rows={5} value={val("description")} onChange={(e) => set({ description: e.target.value })} />
      </div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Chad Quote</label>
        <textarea className="obsv-editor__input" rows={2} value={val("chad_quote")} onChange={(e) => set({ chad_quote: e.target.value })} placeholder="A short line in your voice about this piece" />
      </div>

      {isExisting && formats.find((f) => f.id === val("format_id"))?.slug === "mural" && (
        <>
          <h2 className="admin-page__section-title">Mural Details</h2>
          <MuralDetailsEditor slug={currentSlug} />
        </>
      )}

      <h2 className="admin-page__section-title">Licensing Ideas</h2>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Direct Answer (40–60 words — one paragraph naming the 2–3 strongest placement types)</label>
        <textarea
          className="obsv-editor__input"
          rows={3}
          value={val("licensing_direct_answer")}
          onChange={(e) => set({ licensing_direct_answer: e.target.value })}
          placeholder="e.g. This piece would land in a hospitality lobby, a boutique hotel corridor, or a lifestyle brand's editorial spread — anywhere a large-format work needs to set an emotional tone without competing for the viewer's focus."
        />
      </div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Prose (markdown — expand on scene/space shape, reference styles or brands when useful)</label>
        <textarea className="obsv-editor__input" rows={6} value={val("licensing_content")} onChange={(e) => set({ licensing_content: e.target.value })} />
      </div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Placement Scenarios (one per line — concrete searchable phrases)</label>
        <textarea
          className="obsv-editor__input"
          rows={5}
          value={jsonArray("licensing_key_points").join("\n")}
          onChange={(e) => set({ licensing_key_points: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
          placeholder={"Editorial spread for a travel or lifestyle magazine\nBook cover for a literary fiction imprint\nLobby wall for a boutique hotel\nBrand environment for a premium hospitality group"}
        />
      </div>

      {isExisting && (
        <>
          <h2 className="admin-page__section-title">Editions &amp; pricing</h2>
          <ArtSkuPanel slug={currentSlug} />

          <details style={{ marginTop: "var(--space-md)" }}>
            <summary style={{ cursor: "pointer", fontFamily: "var(--font-ui)", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
              Legacy merch-linked variants (being phased out)
            </summary>
            <ArtVariantsManager slug={currentSlug} />
          </details>

          {(form as { id?: string }).id && (
            <>
              <h2 className="admin-page__section-title">You might also like (shown on art detail page)</h2>
              <EntityPicker sourceType="art" sourceId={(form as { id: string }).id} />
            </>
          )}
        </>
      )}

      <h2 className="admin-page__section-title">GEO / SEO</h2>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Focus Keyphrase</label>
        <input className="obsv-editor__input" value={val("focus_keyphrase")} onChange={(e) => set({ focus_keyphrase: e.target.value })} maxLength={80} />
      </div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Secondary Keyphrases (one per line)</label>
        <textarea
          className="obsv-editor__input"
          rows={3}
          value={secondary.join("\n")}
          onChange={(e) => set({ secondary_keyphrases: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
        />
      </div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Search Intent</label>
        <select className="obsv-editor__input" value={val("search_intent") || "informational"} onChange={(e) => set({ search_intent: e.target.value })}>
          <option value="informational">Informational</option>
          <option value="navigational">Navigational</option>
          <option value="commercial">Commercial</option>
        </select>
      </div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Citation Summary (40–60 words, fact-check / sourcing)</label>
        <textarea className="obsv-editor__input" rows={3} value={val("citation_summary")} onChange={(e) => set({ citation_summary: e.target.value })} maxLength={300} />
      </div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">SEO Title (overrides default)</label>
        <input className="obsv-editor__input" value={val("seo_title")} onChange={(e) => set({ seo_title: e.target.value })} />
      </div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">SEO Description</label>
        <textarea className="obsv-editor__input" rows={2} value={val("seo_description")} onChange={(e) => set({ seo_description: e.target.value })} />
      </div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Entity Tags (one per line — named entities referenced)</label>
        <textarea
          className="obsv-editor__input"
          rows={3}
          value={entities.join("\n")}
          onChange={(e) => set({ entity_tags: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
        />
      </div>

      <h2 className="admin-page__section-title">People Also Ask (Q&amp;A pairs)</h2>
      {paa.map((p, i) => (
        <div key={i} className="obsv-editor__field" style={{ border: "1px solid var(--border-subtle, #2a2a35)", padding: "var(--space-sm)", borderRadius: 6, marginBottom: "var(--space-xs)" }}>
          <input
            className="obsv-editor__input"
            value={p.question}
            placeholder="Question"
            onChange={(e) => {
              const next = [...paa];
              next[i] = { ...next[i], question: e.target.value };
              set({ paa_pairs: next });
            }}
          />
          <textarea
            className="obsv-editor__input"
            rows={2}
            value={p.answer}
            placeholder="Answer"
            onChange={(e) => {
              const next = [...paa];
              next[i] = { ...next[i], answer: e.target.value };
              set({ paa_pairs: next });
            }}
            style={{ marginTop: 4 }}
          />
          <button type="button" className="admin-btn admin-btn--small admin-btn--danger" onClick={() => set({ paa_pairs: paa.filter((_, j) => j !== i) })} style={{ marginTop: 4 }}>Remove</button>
        </div>
      ))}
      <button type="button" className="admin-btn admin-btn--small" onClick={() => set({ paa_pairs: [...paa, { question: "", answer: "" }] })}>+ Add PAA pair</button>
    </div>
  );
}

const SAVE_FIELDS = [
  "title", "slug", "medium", "image_path", "image_alt", "description",
  "display_order", "status", "year_created", "gallery_paths",
  "in_situ_paths", "width_in", "height_in", "depth_in",
  "art_summary", "chad_quote", "format_id",
  "hero_focal_x", "hero_focal_y", "hero_zoom",
  "card_focal_x", "card_focal_y", "card_zoom",
  "portrait_focal_x", "portrait_focal_y", "portrait_zoom",
  "focus_keyphrase", "secondary_keyphrases", "search_intent", "citation_summary",
  "paa_pairs", "entity_tags", "seo_title", "seo_description",
  "licensing_direct_answer", "licensing_content", "licensing_key_points",
] as const;

function buildPayloadFromForm(form: Form): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of SAVE_FIELDS) {
    if (f in form) out[f] = form[f];
  }
  return out;
}
