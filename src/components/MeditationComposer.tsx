"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAutosave } from "@/hooks/useAutosave";
import { RichTextEditor } from "@/components/RichTextEditor";
import { RelatedMusicPanel } from "@/components/RelatedMusicPanel";
import { TaxonomyPicker } from "@/components/TaxonomyPicker";

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

interface MeditationData {
  id?: string;
  subtitle: string;
  body: string;
  plain_text: string;
  status: string;
  categories: string[];
  thoughtlines: string[];
  tags: string[];
  published_at: string | null;
  related_music: { type: "song" | "album"; id: string }[];
}

const emptyMeditation: MeditationData = {
  subtitle: "",
  body: "",
  plain_text: "",
  status: "draft",
  categories: [],
  thoughtlines: [],
  tags: [],
  published_at: null,
  related_music: [],
};

export function MeditationComposer({ meditationId }: { meditationId?: string }) {
  const router = useRouter();
  const [form, setForm] = useState<MeditationData>(emptyMeditation);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(!meditationId);
  const [currentId, setCurrentId] = useState(meditationId);

  const buildPayload = useCallback((d: MeditationData) => ({
    subtitle: d.subtitle,
    body: d.body,
    plain_text: d.plain_text,
    status: d.status,
    categories: d.categories,
    thoughtlines: d.thoughtlines,
    tags: d.tags,
    related_music: d.related_music,
  }), []);

  const { status: autosaveStatus, flush } = useAutosave({
    data: form,
    endpoint: "/api/admin/meditations",
    id: currentId,
    buildPayload,
    onCreated: (newId) => {
      setCurrentId(newId);
      setForm((prev) => ({ ...prev, id: newId }));
      router.replace(`/admin/meditations/${newId}`, { scroll: false });
    },
    enabled: loaded,
  });

  // Metadata options
  const [allCategories, setAllCategories] = useState<CategoryOption[]>([]);
  const [allThoughtlines, setAllThoughtlines] = useState<ThoughtlineOption[]>([]);
  const [allTags, setAllTags] = useState<TagOption[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/categories").then((r) => r.json()),
      fetch("/api/admin/thoughtlines").then((r) => r.json()),
      fetch("/api/admin/tags").then((r) => r.json()),
    ]).then(([cats, tls, tags]) => {
      setAllCategories(cats);
      setAllThoughtlines(tls);
      setAllTags(tags);
    });
  }, []);

  // Load existing meditation
  useEffect(() => {
    if (!meditationId) return;
    fetch(`/api/admin/meditations/${meditationId}`)
      .then((r) => r.json())
      .then((data) => {
        setForm({
          id: data.id,
          subtitle: data.subtitle || "",
          body: data.body,
          plain_text: data.plain_text,
          status: data.status,
          categories: data.categories || [],
          thoughtlines: data.thoughtlines || [],
          tags: data.tags || [],
          published_at: data.published_at,
          related_music: data.related_music || [],
        });
        setLoaded(true);
      });
  }, [meditationId]);

  function handleBodyChange(html: string) {
    const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    setForm((prev) => ({ ...prev, body: html, plain_text: text }));
  }

  function toggleTaxonomy(field: "categories" | "thoughtlines" | "tags", id: string) {
    setForm((prev) => ({
      ...prev,
      [field]: (prev[field] as string[]).includes(id)
        ? (prev[field] as string[]).filter((v) => v !== id)
        : [...(prev[field] as string[]), id],
    }));
  }

  async function handlePublish() {
    setForm((prev) => ({ ...prev, status: "published" }));
    await new Promise((r) => setTimeout(r, 0));
    await flush();
  }

  async function handleDelete() {
    if (!meditationId) return;
    if (!confirm("Delete this meditation? This cannot be undone.")) return;
    await fetch(`/api/admin/meditations/${meditationId}`, { method: "DELETE" });
    router.push("/admin/meditations");
  }

  if (!loaded) {
    return (
      <div className="admin-page">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>
          Loading...
        </p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">
          {meditationId ? "Edit Meditation" : "New Meditation"}
        </h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {meditationId && form.status === "published" && (
            <a href={`/meditations/${meditationId}`} target="_blank" className="admin-btn">
              View
            </a>
          )}
          {meditationId && (
            <button type="button" className="admin-btn admin-btn--danger" onClick={handleDelete}>
              Delete
            </button>
          )}
        </div>
      </div>

      {error && <p className="obsv-editor__error">{error}</p>}

      <div className="med-composer">
        <div className="med-composer__main">
          <input
            type="text"
            className="obsv-editor__input"
            placeholder="Subtitle (optional)"
            value={form.subtitle}
            onChange={(e) => setForm((prev) => ({ ...prev, subtitle: e.target.value }))}
            style={{ marginBottom: "var(--space-xs)" }}
          />

          <RichTextEditor value={form.body} onChange={handleBodyChange} />

          <div className="med-composer__actions">
            <span className={`autosave-status autosave-status--${autosaveStatus}`}>
              {autosaveStatus === "saving" && "Saving..."}
              {autosaveStatus === "saved" && "Saved"}
              {autosaveStatus === "error" && "Save failed"}
            </span>
            {form.status !== "published" && (
              <button type="button" className="admin-btn admin-btn--primary" onClick={handlePublish}>
                Publish
              </button>
            )}
          </div>

          {form.published_at && (
            <p className="med-composer__published-note">
              Published {new Date(form.published_at).toLocaleDateString("en-US", {
                year: "numeric", month: "long", day: "numeric",
              })}
            </p>
          )}
        </div>

        <div className="med-composer__sidebar">
          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Status</h3>
            <select
              className="obsv-editor__input"
              value={form.status}
              onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
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

          <RelatedMusicPanel
            value={form.related_music}
            onChange={(val) => setForm((prev) => ({ ...prev, related_music: val }))}
          />
        </div>
      </div>
    </div>
  );
}
