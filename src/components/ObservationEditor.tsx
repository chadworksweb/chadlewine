"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/utils";
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
import { EntityPicker } from "@/components/EntityPicker";
import { GeoPanel } from "@/components/GeoPanel";
import { RelatedMusicPanel } from "@/components/RelatedMusicPanel";
import { TaxonomyPicker } from "@/components/TaxonomyPicker";

interface ObservationData {
  id?: string;
  title: string;
  slug: string;
  body: string;
  date_captured: string;
  status: string;
  kind: string;
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
}

const emptyObservation: ObservationData = {
  title: "",
  slug: "",
  body: "",
  date_captured: new Date().toISOString().split("T")[0],
  status: "draft",
  kind: "observation",
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
};

function CoverArtPanel({
  imagePath,
  altText,
  onImageChange,
}: {
  imagePath: string;
  altText: string;
  onImageChange: (url: string) => void;
}) {
  const [mediaOpen, setMediaOpen] = useState(false);

  return (
    <div className="obsv-editor__panel">
      <h3 className="obsv-editor__panel-title">Cover Art</h3>

      {imagePath ? (
        <div className="cover-art-preview">
          {/* eslint-disable-next-line @next/next/no-img-element -- admin-only cover preview */}
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

function FullResArtPanel({
  slug,
  printPath,
  wallpaperPath,
  autosaveStatus,
  onPathChange,
}: {
  slug: string;
  printPath: string;
  wallpaperPath: string;
  autosaveStatus: AutosaveStatus;
  onPathChange: (variant: "print" | "wallpaper", path: string) => void;
}) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string>("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  async function copyValue(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1200);
    } catch {
      // clipboard unavailable — silent
    }
  }

  const ART_PULL_ZONE = "https://chadlewine-art.b-cdn.net";
  const fullRef = (p: string) => `${ART_PULL_ZONE}/${p.replace(/^\/+/, "")}`;

  async function handleUpload(variant: "print" | "wallpaper", file: File) {
    setUploading(variant);
    setUploadError("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("type", "art-fullres");
    fd.append("noOverwrite", "1");
    const res = await fetch("/api/admin/media/upload", { method: "POST", body: fd });
    if (res.ok) {
      const data = await res.json();
      onPathChange(variant, data.path as string);
    } else if (res.status === 409) {
      const err = await res.json().catch(() => ({ error: "File already exists" }));
      alert(err.error || "A file with this name already exists. Rename the file and try again.");
      setUploadError("File already exists — rename and retry.");
    } else {
      const err = await res.json().catch(() => ({ error: `Upload failed (${res.status})` }));
      setUploadError(err.error || `Upload failed (${res.status})`);
    }
    setUploading(null);
  }

  const statusLabel =
    autosaveStatus === "saving"
      ? "Saving…"
      : autosaveStatus === "saved"
        ? "Saved"
        : autosaveStatus === "error"
          ? "Save failed"
          : "";
  const statusColor =
    autosaveStatus === "error"
      ? "#ff3333"
      : autosaveStatus === "saved"
        ? "var(--text-tertiary)"
        : "var(--text-secondary)";

  return (
    <div className="obsv-editor__panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-sm)" }}>
        <h3 className="obsv-editor__panel-title" style={{ margin: 0 }}>Full-Res Art</h3>
        {statusLabel && (
          <span style={{ fontSize: "0.6875rem", fontFamily: "var(--font-ui)", color: statusColor }}>
            {statusLabel}
          </span>
        )}
      </div>
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
              <span
                onClick={() => copyValue("print", fullRef(printPath))}
                title={`Click to copy — ${fullRef(printPath)}`}
                style={{
                  fontSize: "0.6875rem",
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-tertiary)",
                  cursor: "pointer",
                  wordBreak: "break-all",
                  userSelect: "none",
                }}
              >
                {fullRef(printPath)}
                {copiedKey === "print" && (
                  <span style={{ marginLeft: 6, color: "#33cc55" }}>Copied</span>
                )}
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
              <span
                onClick={() => copyValue("wallpaper", fullRef(wallpaperPath))}
                title={`Click to copy — ${fullRef(wallpaperPath)}`}
                style={{
                  fontSize: "0.6875rem",
                  fontFamily: "var(--font-mono)",
                  color: "var(--text-tertiary)",
                  cursor: "pointer",
                  wordBreak: "break-all",
                  userSelect: "none",
                }}
              >
                {fullRef(wallpaperPath)}
                {copiedKey === "wallpaper" && (
                  <span style={{ marginLeft: 6, color: "#33cc55" }}>Copied</span>
                )}
              </span>
            )}
          </div>
          {uploadError && (
            <span style={{ fontSize: "0.6875rem", color: "#ff3333" }}>{uploadError}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function ObservationEditor({
  initial,
  defaultKind,
}: {
  initial?: ObservationData;
  defaultKind?: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<ObservationData>(
    initial || {
      ...emptyObservation,
      kind: defaultKind === "journal" ? "journal" : "observation",
    },
  );
  const section = form.kind === "journal" ? "journal" : "observations";
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- setter reserved for upcoming server-error surfacing
  const [error, setError] = useState("");
  const [allCategories, setAllCategories] = useState<CategoryOption[]>([]);
  const [allThoughtlines, setAllThoughtlines] = useState<ThoughtlineOption[]>([]);
  const [allTags, setAllTags] = useState<TagOption[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);

  // Copy the PUBLIC (production) post URL -- never localhost/staging. Hardcodes
  // the production host so the link is shareable from any environment.
  const copyPublicLink = async () => {
    const url = `https://chadlewine.com/${section}/${form.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    } catch {
      window.prompt("Copy this link:", url);
    }
  };

  const buildPayload = useCallback((d: ObservationData) => ({
    title: d.title,
    slug: d.slug,
    body: d.body,
    date_captured: d.date_captured,
    status: d.status,
    kind: d.kind,
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
    art_fullres_print_path: d.art_fullres_print_path,
    art_fullres_wallpaper_path: d.art_fullres_wallpaper_path,
  }), []);

  const { status: autosaveStatus } = useAutosave({
    data: form,
    endpoint: "/api/admin/observations",
    id: form.id,
    buildPayload,
    onCreated: (newId) => {
      setForm((prev) => ({ ...prev, id: newId }));
      router.replace(`/admin/observations/${form.slug || newId}`, { scroll: false });
    },
    enabled: !!form.title && !!form.slug && !!form.date_captured,
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

  function toggleTaxonomy(field: "categories" | "thoughtlines" | "tags", id: string) {
    setForm((prev) => {
      const has = (prev[field] as string[]).includes(id);
      const next = has
        ? (prev[field] as string[]).filter((v) => v !== id)
        : [...(prev[field] as string[]), id];
      return { ...prev, [field]: next };
    });
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
          {form.kind === "journal"
            ? !form.id ? "New Journal Entry" : "Edit Journal Entry"
            : !form.id ? "New Observation" : "Edit Observation"}
        </h1>
        <div className="obsv-editor__actions">
          {form.id && (
            <>
              <button
                type="button"
                className="admin-btn admin-btn--icon"
                onClick={copyPublicLink}
                title="Copy public link"
                aria-label="Copy public link"
              >
                {linkCopied ? (
                  "Copied!"
                ) : (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                )}
              </button>
              <a
                className="admin-btn"
                href={`/${section}/${form.slug}`}
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
              placeholder="Most provocative sentence — feeds Hook fragment"
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

          {form.id && (
            <div style={{ marginTop: "1.5rem" }}>
              <h3 className="obsv-editor__panel-title">You might also like (shown on observation page)</h3>
              <EntityPicker sourceType="observation" sourceId={form.id} />
            </div>
          )}

        </div>

        {/* Sidebar column */}
        <div className="obsv-editor__sidebar">
          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Publish</h3>

            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="kind">Kind</label>
              <select
                id="kind"
                className="obsv-editor__select"
                value={form.kind}
                onChange={(e) => set("kind", e.target.value)}
              >
                <option value="observation">Observation (not about me)</option>
                <option value="journal">Journal (about me / my music)</option>
              </select>
            </div>

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

          <TaxonomyPicker
            heading="Categories"
            items={allCategories}
            selected={form.categories}
            onToggle={(id) => toggleTaxonomy("categories", id)}
            onCreate={(item) => {
              setAllCategories((prev) => [...prev, item as CategoryOption].sort((a, b) => a.title.localeCompare(b.title)));
              setForm((prev) => ({ ...prev, categories: [...prev.categories, item.id] }));
            }}
            createEndpoint="/api/admin/categories"
            createPlaceholder="+ New category"
          />

          <TaxonomyPicker
            heading="Thoughtlines"
            items={allThoughtlines}
            selected={form.thoughtlines}
            onToggle={(id) => toggleTaxonomy("thoughtlines", id)}
            onCreate={(item) => {
              setAllThoughtlines((prev) => [...prev, item as ThoughtlineOption].sort((a, b) => a.title.localeCompare(b.title)));
              setForm((prev) => ({ ...prev, thoughtlines: [...prev.thoughtlines, item.id] }));
            }}
            createEndpoint="/api/admin/thoughtlines"
            createPlaceholder="+ New thoughtline"
          />

          <TaxonomyPicker
            heading="Tags"
            items={allTags}
            selected={form.tags}
            onToggle={(id) => toggleTaxonomy("tags", id)}
            onCreate={(item) => {
              setAllTags((prev) => [...prev, item as TagOption].sort((a, b) => a.label.localeCompare(b.label)));
              setForm((prev) => ({ ...prev, tags: [...prev.tags, item.id] }));
            }}
            createEndpoint="/api/admin/tags"
            createPlaceholder="+ New tag"
            nameField="label"
          />

          <CoverArtPanel
            imagePath={form.art_image_path}
            altText={form.art_alt}
            onImageChange={(url) => set("art_image_path", url)}
          />

          <FullResArtPanel
            slug={form.slug}
            printPath={form.art_fullres_print_path}
            wallpaperPath={form.art_fullres_wallpaper_path}
            autosaveStatus={autosaveStatus}
            onPathChange={(variant, path) => {
              set(
                variant === "print" ? "art_fullres_print_path" : "art_fullres_wallpaper_path",
                path,
              );
            }}
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
        contentType="observation"
      />
    </div>
  );
}
