"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { slugify, thumbnailUrl } from "@/lib/utils";

interface DomainOption {
  slug: string;
  label: string;
}
import { RichTextEditor } from "@/components/RichTextEditor";
import { MediaLibrary } from "@/components/MediaLibrary";

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
  source: string;
  domains: string[];
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
  source: "original",
  domains: [],
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
    <div className="obs-editor__panel">
      <h3 className="obs-editor__panel-title">Cover Art</h3>

      {imagePath ? (
        <div className="cover-art-preview">
          <img
            src={thumbnailUrl(imagePath, 300, 200)}
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

      <div className="obs-editor__field" style={{ marginTop: "var(--space-md)" }}>
        <label className="obs-editor__label" htmlFor="art_alt">Alt Text</label>
        <input
          id="art_alt"
          className="obs-editor__input"
          type="text"
          value={altText}
          onChange={(e) => onAltChange(e.target.value)}
        />
      </div>

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

export function ObservationEditor({
  initial,
}: {
  initial?: ObservationData;
}) {
  const router = useRouter();
  const isNew = !initial?.id;
  const [form, setForm] = useState<ObservationData>(initial || emptyObservation);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [allDomains, setAllDomains] = useState<DomainOption[]>([]);

  useEffect(() => {
    fetch("/api/admin/domains")
      .then((r) => r.json())
      .then((data) => setAllDomains(data));
  }, []);

  const set = useCallback(
    (field: keyof ObservationData, value: string | string[]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setSaved(false);
    },
    []
  );

  // Auto-generate slug from title (only for new observations)
  function handleTitleChange(value: string) {
    set("title", value);
    if (isNew) {
      set("slug", slugify(value));
    }
  }

  function toggleDomain(slug: string) {
    setForm((prev) => {
      const has = prev.domains.includes(slug);
      const next = has
        ? prev.domains.filter((d) => d !== slug)
        : [...prev.domains, slug];
      return { ...prev, domains: next };
    });
    setSaved(false);
  }

  async function handleSave() {
    setError("");
    setSaving(true);

    const payload = {
      title: form.title,
      slug: form.slug,
      body: form.body,
      date_captured: form.date_captured,
      status: form.status,
      hook_line: form.hook_line,
      tension_line: form.tension_line,
      art_image_path: form.art_image_path,
      art_alt: form.art_alt,
      seo_title: form.seo_title,
      seo_description: form.seo_description,
      source: form.source,
      domains: form.domains,
    };

    const url = isNew
      ? "/api/admin/observations"
      : `/api/admin/observations/${form.id}`;
    const method = isNew ? "POST" : "PUT";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Save failed");
      setSaving(false);
      return;
    }

    const data = await res.json();
    setSaving(false);
    setSaved(true);

    if (isNew) {
      router.push(`/admin/observations/${data.id}`);
    } else {
      router.refresh();
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
    <div className="obs-editor">
      <div className="obs-editor__header">
        <h1 className="admin-page__title">
          {isNew ? "New Observation" : "Edit Observation"}
        </h1>
        <div className="obs-editor__actions">
          {!isNew && (
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
          <button
            className="admin-btn admin-btn--primary"
            onClick={handleSave}
            disabled={saving}
            type="button"
          >
            {saving ? "Saving..." : saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      {error && <p className="obs-editor__error">{error}</p>}

      <div className="obs-editor__grid">
        {/* Main column */}
        <div className="obs-editor__main">
          <div className="obs-editor__field">
            <label className="obs-editor__label" htmlFor="title">Title</label>
            <input
              id="title"
              className="obs-editor__input"
              type="text"
              value={form.title}
              onChange={(e) => handleTitleChange(e.target.value)}
            />
          </div>

          <div className="obs-editor__field">
            <label className="obs-editor__label" htmlFor="slug">Slug</label>
            <input
              id="slug"
              className="obs-editor__input obs-editor__input--mono"
              type="text"
              value={form.slug}
              onChange={(e) => set("slug", e.target.value)}
            />
          </div>

          <div className="obs-editor__field">
            <label className="obs-editor__label">Body</label>
            <RichTextEditor
              value={form.body}
              onChange={(html) => set("body", html)}
            />
          </div>

          <div className="obs-editor__field">
            <label className="obs-editor__label" htmlFor="hook_line">Hook Line</label>
            <textarea
              id="hook_line"
              className="obs-editor__textarea obs-editor__textarea--short"
              value={form.hook_line}
              onChange={(e) => set("hook_line", e.target.value)}
              rows={3}
              placeholder="Most provocative sentence — feeds Hook fragment + Diddy"
            />
          </div>

          <div className="obs-editor__field">
            <label className="obs-editor__label" htmlFor="tension_line">Tension Line</label>
            <textarea
              id="tension_line"
              className="obs-editor__textarea obs-editor__textarea--short"
              value={form.tension_line}
              onChange={(e) => set("tension_line", e.target.value)}
              rows={3}
              placeholder="The contradiction — feeds Tension fragment"
            />
          </div>
        </div>

        {/* Sidebar column */}
        <div className="obs-editor__sidebar">
          <div className="obs-editor__panel">
            <h3 className="obs-editor__panel-title">Publish</h3>

            <div className="obs-editor__field">
              <label className="obs-editor__label" htmlFor="status">Status</label>
              <select
                id="status"
                className="obs-editor__select"
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="volume-collected">Volume Collected</option>
              </select>
            </div>

            <div className="obs-editor__field">
              <label className="obs-editor__label" htmlFor="date_captured">Date Captured</label>
              <input
                id="date_captured"
                className="obs-editor__input"
                type="date"
                value={form.date_captured}
                onChange={(e) => set("date_captured", e.target.value)}
              />
            </div>

            <div className="obs-editor__field">
              <label className="obs-editor__label" htmlFor="source">Source</label>
              <select
                id="source"
                className="obs-editor__select"
                value={form.source}
                onChange={(e) => set("source", e.target.value)}
              >
                <option value="original">Original</option>
                <option value="chad-rising">Chad Rising</option>
                <option value="chadlewine-pre2023">Pre-2023</option>
                <option value="honeychrome">Honeychrome</option>
              </select>
            </div>
          </div>

          <div className="obs-editor__panel">
            <h3 className="obs-editor__panel-title">
              Domains
              <span className="obs-editor__counter">{form.domains.length} selected</span>
            </h3>
            <div className="obs-editor__domain-grid">
              {allDomains.map((d) => {
                const isSelected = form.domains.includes(d.slug);
                return (
                  <button
                    key={d.slug}
                    type="button"
                    className={`obs-editor__domain-chip${isSelected ? " obs-editor__domain-chip--active" : ""}`}
                    onClick={() => toggleDomain(d.slug)}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <CoverArtPanel
            imagePath={form.art_image_path}
            altText={form.art_alt}
            onImageChange={(url) => set("art_image_path", url)}
            onAltChange={(alt) => set("art_alt", alt)}
          />

          <div className="obs-editor__panel">
            <h3 className="obs-editor__panel-title">SEO</h3>

            <div className="obs-editor__field">
              <label className="obs-editor__label" htmlFor="seo_title">
                SEO Title
                <span className="obs-editor__counter">
                  {form.seo_title.length}/60
                </span>
              </label>
              <input
                id="seo_title"
                className="obs-editor__input"
                type="text"
                value={form.seo_title}
                onChange={(e) => set("seo_title", e.target.value)}
                maxLength={60}
              />
            </div>

            <div className="obs-editor__field">
              <label className="obs-editor__label" htmlFor="seo_description">
                SEO Description
                <span className="obs-editor__counter">
                  {form.seo_description.length}/160
                </span>
              </label>
              <textarea
                id="seo_description"
                className="obs-editor__textarea obs-editor__textarea--short"
                value={form.seo_description}
                onChange={(e) => set("seo_description", e.target.value)}
                maxLength={160}
                rows={3}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
