"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { slugify, thumbnailUrl } from "@/lib/utils";
import { useAutosave, type AutosaveStatus } from "@/hooks/useAutosave";

interface CategoryOption {
  id: string;
  title: string;
  slug: string;
}

interface ThoughtlineOption {
  id: string;
  title: string;
  slug: string;
}

interface TagOption {
  id: string;
  label: string;
  slug: string;
}

import { RichTextEditor } from "@/components/RichTextEditor";
import { MediaLibrary } from "@/components/MediaLibrary";
import { GeoPanel } from "@/components/GeoPanel";
import { RelatedMusicPanel } from "@/components/RelatedMusicPanel";

interface ObservationData {
  id?: string;
  title: string;
  slug: string;
  body: string;
  date_captured: string;
  status: string;
  hook_line: string;
  tension_line: string;
  art_image_path: string;
  art_alt: string;
  seo_title: string;
  seo_description: string;
  categories: string[];
  thoughtlines: string[];
  tags: string[];
  // SEO/GEO fields (Phase 5-6)
  focus_keyphrase: string;
  secondary_keyphrases: string[];
  search_intent: string;
  citation_summary: string;
  first_sentence_extractable: boolean;
  paa_pairs: { question: string; answer: string }[];
  entity_tags: string[];
  article_type: string;
  published_at: string | null;
  related_music: { type: "song" | "album"; id: string }[];
  art_fullres_print_path: string;
  art_fullres_wallpaper_path: string;
  audio_file_path: string;
}

const emptyObservation: ObservationData = {
  title: "",
  slug: "",
  body: "",
  date_captured: new Date().toISOString().split("T")[0],
  status: "draft",
  hook_line: "",
  tension_line: "",
  art_image_path: "",
  art_alt: "",
  seo_title: "",
  seo_description: "",
  categories: [],
  thoughtlines: [],
  tags: [],
  focus_keyphrase: "",
  secondary_keyphrases: [],
  search_intent: "informational",
  citation_summary: "",
  first_sentence_extractable: false,
  paa_pairs: [],
  entity_tags: [],
  article_type: "article",
  published_at: null,
  related_music: [],
  art_fullres_print_path: "",
  art_fullres_wallpaper_path: "",
  audio_file_path: "",
};

function CoverArtPanel({
  imagePath,
  altText,
  onImageChange,
  onAltChange,
}: {
  imagePath: string;
  altText: string;
  onImageChange: (url: string) => void;
  onAltChange: (alt: string) => void;
}) {
  const [mediaOpen, setMediaOpen] = useState(false);

  return (
    <div className="obsv-editor__panel">
      <h3 className="obsv-editor__panel-title">Cover Art</h3>

      {imagePath ? (
        <div className="cover-art-preview">
          <img
            src={imagePath}
            alt={altText || "Cover art preview"}
            className="cover-art-preview__img"
          />
          <div className="cover-art-preview__actions">
            <button
              type="button"
              className="admin-btn admin-btn--primary"
              onClick={() => setMediaOpen(true)}
              style={{ fontSize: "0.6875rem", padding: "4px 12px" }}
            >
              Replace
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--danger"
              onClick={() => onImageChange("")}
              style={{ fontSize: "0.6875rem", padding: "4px 12px" }}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="cover-art-upload"
          onClick={() => setMediaOpen(true)}
        >
          Choose Cover Art
        </button>
      )}

      <MediaLibrary
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        onSelect={(url: string) => {
          onImageChange(url);
          setMediaOpen(false);
        }}
      />
    </div>
  );
}

function AudioUploadPanel({
  slug,
  observationId,
  audioPath,
  onUploadComplete,
}: {
  slug: string;
  observationId: string | undefined;
  audioPath: string;
  onUploadComplete: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function handleUpload(file: File) {
    if (!observationId || !slug) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("slug", slug);
    fd.append("observation_id", observationId);
    const res = await fetch("/api/admin/observation-audio", { method: "POST", body: fd });
    if (res.ok) {
      const data = await res.json();
      onUploadComplete(data.url);
    }
    setUploading(false);
  }

  async function handleRemove() {
    if (!observationId || !audioPath) return;
    // Extract storage path from full URL
    const match = audioPath.match(/observation-audio\/(.+)$/);
    if (!match) return;
    await fetch("/api/admin/observation-audio", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ observation_id: observationId, path: match[1] }),
    });
    onUploadComplete("");
  }

  return (
    <div className="obsv-editor__panel">
      <h3 className="obsv-editor__panel-title">Audio Reading</h3>
      {!slug && (
        <p className="obsv-editor__hint">Save the observation first to enable uploads.</p>
      )}
      {slug && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          {audioPath ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
              <audio controls src={audioPath} style={{ width: "100%", height: 36 }} />
              <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "center" }}>
                <label style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", cursor: "pointer" }}>
                  Replace
                  <input
                    type="file"
                    accept="audio/mpeg,audio/wav,audio/mp4,audio/ogg"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
                    disabled={uploading}
                    style={{ display: "none" }}
                  />
                </label>
                <button
                  type="button"
                  onClick={handleRemove}
                  className="admin-btn admin-btn--danger"
                  style={{ fontSize: "0.6875rem", padding: "4px 12px" }}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div>
              <input
                type="file"
                accept="audio/mpeg,audio/wav,audio/mp4,audio/ogg"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }}
                disabled={uploading}
                style={{ fontSize: "var(--text-xs)" }}
              />
              {uploading && (
                <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", marginLeft: "var(--space-sm)" }}>
                  Uploading...
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FullResArtPanel({
  slug,
  printPath,
  wallpaperPath,
  onUploadComplete,
}: {
  slug: string;
  printPath: string;
  wallpaperPath: string;
  onUploadComplete: () => void;
}) {
  const [uploading, setUploading] = useState<string | null>(null);

  async function handleUpload(variant: "print" | "wallpaper", file: File) {
    setUploading(variant);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("slug", slug);
    fd.append("variant", variant);
    const res = await fetch("/api/admin/art-fullres", { method: "POST", body: fd });
    if (res.ok) onUploadComplete();
    setUploading(null);
  }

  return (
    <div className="obsv-editor__panel">
      <h3 className="obsv-editor__panel-title">Full-Res Art</h3>
      {!slug && (
        <p className="obsv-editor__hint">Save the observation first to enable uploads.</p>
      )}
      {slug && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
          <div className="obsv-editor__field">
            <label className="obsv-editor__label">
              Print ({printPath ? "uploaded" : "none"})
              {uploading === "print" && " — uploading..."}
            </label>
            <input
              type="file"
              accept="image/png,image/tiff"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload("print", f);
              }}
              disabled={!!uploading}
              style={{ fontSize: "var(--text-xs)" }}
            />
            {printPath && (
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>
                {printPath}
              </span>
            )}
          </div>
          <div className="obsv-editor__field">
            <label className="obsv-editor__label">
              Wallpaper ({wallpaperPath ? "uploaded" : "none"})
              {uploading === "wallpaper" && " — uploading..."}
            </label>
            <input
              type="file"
              accept="image/webp,image/png"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload("wallpaper", f);
              }}
              disabled={!!uploading}
              style={{ fontSize: "var(--text-xs)" }}
            />
            {wallpaperPath && (
              <span style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)" }}>
                {wallpaperPath}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ObservationEditor({
  initial,
}: {
  initial?: ObservationData;
}) {
  const router = useRouter();
  const [form, setForm] = useState<ObservationData>(initial || emptyObservation);
  const [error, setError] = useState("");
  const [allCategories, setAllCategories] = useState<CategoryOption[]>([]);
  const [allThoughtlines, setAllThoughtlines] = useState<ThoughtlineOption[]>([]);
  const [allTags, setAllTags] = useState<TagOption[]>([]);
  const [newCategoryTitle, setNewCategoryTitle] = useState("");
  const [newThoughtlineTitle, setNewThoughtlineTitle] = useState("");
  const [newTagLabel, setNewTagLabel] = useState("");

  const buildPayload = useCallback((d: ObservationData) => ({
    title: d.title,
    slug: d.slug,
    body: d.body,
    date_captured: d.date_captured,
    status: d.status,
    hook_line: d.hook_line,
    tension_line: d.tension_line,
    art_image_path: d.art_image_path,
    art_alt: d.art_alt,
    seo_title: d.seo_title,
    seo_description: d.seo_description,
    categories: d.categories,
    thoughtlines: d.thoughtlines,
    tags: d.tags,
    focus_keyphrase: d.focus_keyphrase,
    secondary_keyphrases: d.secondary_keyphrases,
    search_intent: d.search_intent,
    citation_summary: d.citation_summary,
    first_sentence_extractable: d.first_sentence_extractable,
    paa_pairs: d.paa_pairs,
    entity_tags: d.entity_tags,
    article_type: d.article_type,
    related_music: d.related_music,
  }), []);

  const { status: autosaveStatus, flush } = useAutosave({
    data: form,
    endpoint: "/api/admin/observations",
    id: form.id,
    buildPayload,
    onCreated: (newId) => {
      setForm((prev) => ({ ...prev, id: newId }));
      router.replace(`/admin/observations/${newId}`, { scroll: false });
    },
    enabled: !!form.title && !!form.slug && !!form.body && !!form.date_captured,
  });

  useEffect(() => {
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then((data) => setAllCategories(data.sort((a: CategoryOption, b: CategoryOption) => a.title.localeCompare(b.title))));
    fetch("/api/admin/thoughtlines")
      .then((r) => r.json())
      .then((data) => setAllThoughtlines(data.sort((a: ThoughtlineOption, b: ThoughtlineOption) => a.title.localeCompare(b.title))));
    fetch("/api/admin/tags")
      .then((r) => r.json())
      .then((data) => setAllTags(data.sort((a: TagOption, b: TagOption) => a.label.localeCompare(b.label))));
}, []);

  const set = useCallback(
    (field: keyof ObservationData | string, value: unknown) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  function handleTitleChange(value: string) {
    set("title", value);
    if (!form.id) {
      set("slug", slugify(value));
    }
  }

  function toggleCategory(id: string) {
    setForm((prev) => {
      const has = prev.categories.includes(id);
      const next = has
        ? prev.categories.filter((c) => c !== id)
        : [...prev.categories, id];
      return { ...prev, categories: next };
    });
  }

  async function handleCreateCategory() {
    const title = newCategoryTitle.trim();
    if (!title) return;
    const slug = title
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const res = await fetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, slug }),
    });
    if (res.ok) {
      const created = await res.json();
      setAllCategories((prev) =>
        [...prev, { id: created.id, title: created.title, slug: created.slug }].sort((a, b) =>
          a.title.localeCompare(b.title)
        )
      );
      setForm((prev) => ({ ...prev, categories: [...prev.categories, created.id] }));
      setNewCategoryTitle("");
    }
  }

  function toggleThoughtline(id: string) {
    setForm((prev) => {
      const has = prev.thoughtlines.includes(id);
      const next = has
        ? prev.thoughtlines.filter((t) => t !== id)
        : [...prev.thoughtlines, id];
      return { ...prev, thoughtlines: next };
    });
  }

  async function handleCreateThoughtline() {
    const title = newThoughtlineTitle.trim();
    if (!title) return;
    const slug = title
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const res = await fetch("/api/admin/thoughtlines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, slug }),
    });
    if (res.ok) {
      const created = await res.json();
      setAllThoughtlines((prev) =>
        [...prev, { id: created.id, title: created.title, slug: created.slug }].sort((a, b) =>
          a.title.localeCompare(b.title)
        )
      );
      setForm((prev) => ({ ...prev, thoughtlines: [...prev.thoughtlines, created.id] }));
      setNewThoughtlineTitle("");
    }
  }

  function toggleTag(id: string) {
    setForm((prev) => {
      const has = prev.tags.includes(id);
      const next = has
        ? prev.tags.filter((t) => t !== id)
        : [...prev.tags, id];
      return { ...prev, tags: next };
    });
  }

  async function handleCreateTag() {
    const label = newTagLabel.trim();
    if (!label) return;
    const slug = label
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const res = await fetch("/api/admin/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, slug }),
    });
    if (res.ok) {
      const created = await res.json();
      setAllTags((prev) =>
        [...prev, { id: created.id, label: created.label, slug: created.slug }].sort((a, b) =>
          a.label.localeCompare(b.label)
        )
      );
      setForm((prev) => ({ ...prev, tags: [...prev.tags, created.id] }));
      setNewTagLabel("");
    }
  }

  async function handleDelete() {
    if (!form.id) return;
    if (!confirm("Delete this observation? This cannot be undone.")) return;

    const res = await fetch(`/api/admin/observations/${form.id}`, {
      method: "DELETE",
    });

    if (res.ok) {
      router.push("/admin/observations");
    }
  }

  return (
    <div className="obsv-editor">
      <div className="obsv-editor__header">
        <h1 className="admin-page__title">
          {!form.id ? "New Observation" : "Edit Observation"}
        </h1>
        <div className="obsv-editor__actions">
          {form.id && (
            <>
              <a
                className="admin-btn"
                href={`/observations/${form.slug}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View Post
              </a>
              <button
                className="admin-btn admin-btn--danger"
                onClick={handleDelete}
                type="button"
              >
                Delete
              </button>
            </>
          )}
          <span className={`autosave-status autosave-status--${autosaveStatus}`}>
            {autosaveStatus === "saving" && "Saving..."}
            {autosaveStatus === "saved" && "Saved"}
            {autosaveStatus === "error" && "Save failed"}
          </span>
        </div>
      </div>

      {error && <p className="obsv-editor__error">{error}</p>}

      <div className="obsv-editor__grid">
        {/* Main column */}
        <div className="obsv-editor__main">
          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="title">Title</label>
            <input
              id="title"
              className="obsv-editor__input"
              type="text"
              value={form.title}
              onChange={(e) => handleTitleChange(e.target.value)}
            />
          </div>

          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="slug">Slug</label>
            <input
              id="slug"
              className="obsv-editor__input obsv-editor__input--mono"
              type="text"
              value={form.slug}
              onChange={(e) => set("slug", e.target.value)}
            />
          </div>

          <div className="obsv-editor__field">
            <label className="obsv-editor__label">Body</label>
            <RichTextEditor
              value={form.body}
              onChange={(html) => set("body", html)}
            />
          </div>

          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="hook_line">Hook Line</label>
            <textarea
              id="hook_line"
              className="obsv-editor__textarea obsv-editor__textarea--short"
              value={form.hook_line}
              onChange={(e) => set("hook_line", e.target.value)}
              rows={3}
              placeholder="Most provocative sentence — feeds Hook fragment + Diddy"
            />
          </div>

          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="tension_line">Tension Line</label>
            <textarea
              id="tension_line"
              className="obsv-editor__textarea obsv-editor__textarea--short"
              value={form.tension_line}
              onChange={(e) => set("tension_line", e.target.value)}
              rows={3}
              placeholder="The contradiction — feeds Tension fragment"
            />
          </div>

        </div>

        {/* Sidebar column */}
        <div className="obsv-editor__sidebar">
          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Publish</h3>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="status">Status</label>
              <select
                id="status"
                className="obsv-editor__select"
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="private">Private</option>
                <option value="trash">Trash</option>
              </select>
            </div>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="date_captured">Date</label>
              <input
                id="date_captured"
                className="obsv-editor__input"
                type="date"
                value={form.date_captured}
                onChange={(e) => set("date_captured", e.target.value)}
              />
            </div>

          </div>

          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">
              Categories
              <span className="obsv-editor__counter">{form.categories.length} selected</span>
            </h3>
            {form.categories.length > 0 && (
              <div className="obsv-editor__chip-section">
                <span className="obsv-editor__chip-label">Selected</span>
                <div className="obsv-editor__chip-grid">
                  {allCategories
                    .filter((c) => form.categories.includes(c.id))
                    .map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="obsv-editor__chip obsv-editor__chip--active"
                        onClick={() => toggleCategory(c.id)}
                      >
                        {c.title}
                      </button>
                    ))}
                </div>
              </div>
            )}
            <div className="obsv-editor__chip-section">
              <span className="obsv-editor__chip-label">Available</span>
              <div className="obsv-editor__chip-grid">
                {allCategories
                  .filter((c) => !form.categories.includes(c.id))
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="obsv-editor__chip"
                      onClick={() => toggleCategory(c.id)}
                    >
                      {c.title}
                    </button>
                  ))}
                <input
                  type="text"
                  className="obsv-editor__chip"
                  placeholder="+ New category"
                  value={newCategoryTitle}
                  onChange={(e) => setNewCategoryTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreateCategory();
                    }
                  }}
                  style={{ border: "1px dashed var(--border)", background: "transparent", cursor: "text", textAlign: "left" }}
                />
              </div>
            </div>
          </div>

          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">
              Thoughtlines
              <span className="obsv-editor__counter">{form.thoughtlines.length} selected</span>
            </h3>
            {form.thoughtlines.length > 0 && (
              <div className="obsv-editor__chip-section">
                <span className="obsv-editor__chip-label">Selected</span>
                <div className="obsv-editor__chip-grid">
                  {allThoughtlines
                    .filter((t) => form.thoughtlines.includes(t.id))
                    .map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="obsv-editor__chip obsv-editor__chip--active"
                        onClick={() => toggleThoughtline(t.id)}
                      >
                        {t.title}
                      </button>
                    ))}
                </div>
              </div>
            )}
            <div className="obsv-editor__chip-section">
              <span className="obsv-editor__chip-label">Available</span>
              <div className="obsv-editor__chip-grid">
                {allThoughtlines
                  .filter((t) => !form.thoughtlines.includes(t.id))
                  .map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="obsv-editor__chip"
                      onClick={() => toggleThoughtline(t.id)}
                    >
                      {t.title}
                    </button>
                  ))}
                <input
                  type="text"
                  className="obsv-editor__chip"
                  placeholder="+ New thoughtline"
                  value={newThoughtlineTitle}
                  onChange={(e) => setNewThoughtlineTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreateThoughtline();
                    }
                  }}
                  style={{ border: "1px dashed var(--border)", background: "transparent", cursor: "text", textAlign: "left" }}
                />
              </div>
            </div>
          </div>

          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">
              Tags
              <span className="obsv-editor__counter">{form.tags.length} selected</span>
            </h3>
            {form.tags.length > 0 && (
              <div className="obsv-editor__chip-section">
                <span className="obsv-editor__chip-label">Selected</span>
                <div className="obsv-editor__chip-grid">
                  {allTags
                    .filter((t) => form.tags.includes(t.id))
                    .map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="obsv-editor__chip obsv-editor__chip--active"
                        onClick={() => toggleTag(t.id)}
                      >
                        {t.label}
                      </button>
                    ))}
                </div>
              </div>
            )}
            <div className="obsv-editor__chip-section">
              <span className="obsv-editor__chip-label">Available</span>
              <div className="obsv-editor__chip-grid">
                {allTags
                  .filter((t) => !form.tags.includes(t.id))
                  .map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="obsv-editor__chip"
                      onClick={() => toggleTag(t.id)}
                    >
                      {t.label}
                    </button>
                  ))}
                <input
                  type="text"
                  className="obsv-editor__chip"
                  placeholder="+ New tag"
                  value={newTagLabel}
                  onChange={(e) => setNewTagLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreateTag();
                    }
                  }}
                  style={{ border: "1px dashed var(--border)", background: "transparent", cursor: "text", textAlign: "left" }}
                />
              </div>
            </div>
          </div>

          <CoverArtPanel
            imagePath={form.art_image_path}
            altText={form.art_alt}
            onImageChange={(url) => set("art_image_path", url)}
            onAltChange={(alt) => set("art_alt", alt)}
          />

          <FullResArtPanel
            slug={form.slug}
            printPath={form.art_fullres_print_path}
            wallpaperPath={form.art_fullres_wallpaper_path}
            onUploadComplete={() => {
              // Refresh form from server to get updated paths
              if (form.id) {
                fetch(`/api/admin/observations/${form.id}`)
                  .then((r) => r.json())
                  .then((d) => {
                    set("art_fullres_print_path", d.observation?.art_fullres_print_path || "");
                    set("art_fullres_wallpaper_path", d.observation?.art_fullres_wallpaper_path || "");
                  });
              }
            }}
          />

          <AudioUploadPanel
            slug={form.slug}
            observationId={form.id}
            audioPath={form.audio_file_path}
            onUploadComplete={(url) => set("audio_file_path", url)}
          />

          <RelatedMusicPanel
            value={form.related_music}
            onChange={(val) => set("related_music", val)}
          />

        </div>
      </div>

      <GeoPanel
        body={form.body}
        focusKeyphrase={form.focus_keyphrase}
        secondaryKeyphrases={form.secondary_keyphrases}
        searchIntent={form.search_intent}
        citationSummary={form.citation_summary}
        firstSentenceExtractable={form.first_sentence_extractable}
        paaPairs={form.paa_pairs}
        entityTags={form.entity_tags}
        articleType={form.article_type}
        artImagePath={form.art_image_path}
        artAlt={form.art_alt}
        dateCaptured={form.date_captured}
        publishedAt={form.published_at}
        hookLine={form.hook_line}
        tensionLine={form.tension_line}
        seoTitle={form.seo_title}
        seoDescription={form.seo_description}
        onChange={(field, value) => set(field as keyof ObservationData, value)}
      />
    </div>
  );
}
