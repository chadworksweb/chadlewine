"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAutosave, type AutosaveStatus } from "@/hooks/useAutosave";
import { RelatedMusicPanel } from "@/components/RelatedMusicPanel";

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
  const editorRef = useRef<HTMLDivElement>(null);
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
    enabled: loaded && !!form.body && !!form.plain_text?.trim(),
  });

  // Metadata options
  const [allCategories, setAllCategories] = useState<CategoryOption[]>([]);
  const [allThoughtlines, setAllThoughtlines] = useState<ThoughtlineOption[]>([]);
  const [allTags, setAllTags] = useState<TagOption[]>([]);
  const [newCategoryTitle, setNewCategoryTitle] = useState("");
  const [newThoughtlineTitle, setNewThoughtlineTitle] = useState("");
  const [newTagLabel, setNewTagLabel] = useState("");

  // Load metadata options
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
        if (editorRef.current) {
          editorRef.current.innerHTML = data.body;
        }
        setLoaded(true);
      });
  }, [meditationId]);

  // Sync contenteditable → state
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    const text = editorRef.current.textContent || "";
    setForm((prev) => ({ ...prev, body: html, plain_text: text }));
  }, []);

  // Formatting commands
  function execCmd(cmd: string) {
    document.execCommand(cmd, false);
    editorRef.current?.focus();
    handleInput();
  }

  // Metadata toggles
  function toggleCategory(id: string) {
    setForm((prev) => ({
      ...prev,
      categories: prev.categories.includes(id)
        ? prev.categories.filter((c) => c !== id)
        : [...prev.categories, id],
    }));
  }

  function toggleThoughtline(id: string) {
    setForm((prev) => ({
      ...prev,
      thoughtlines: prev.thoughtlines.includes(id)
        ? prev.thoughtlines.filter((t) => t !== id)
        : [...prev.thoughtlines, id],
    }));
  }

  function toggleTag(id: string) {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(id)
        ? prev.tags.filter((t) => t !== id)
        : [...prev.tags, id],
    }));
  }

  async function handleCreateCategory() {
    if (!newCategoryTitle.trim()) return;
    const res = await fetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newCategoryTitle.trim() }),
    });
    if (res.ok) {
      const cat = await res.json();
      setAllCategories((prev) => [...prev, cat].sort((a, b) => a.title.localeCompare(b.title)));
      setForm((prev) => ({ ...prev, categories: [...prev.categories, cat.id] }));
      setNewCategoryTitle("");
    }
  }

  async function handleCreateThoughtline() {
    if (!newThoughtlineTitle.trim()) return;
    const res = await fetch("/api/admin/thoughtlines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newThoughtlineTitle.trim() }),
    });
    if (res.ok) {
      const tl = await res.json();
      setAllThoughtlines((prev) => [...prev, tl].sort((a, b) => a.title.localeCompare(b.title)));
      setForm((prev) => ({ ...prev, thoughtlines: [...prev.thoughtlines, tl.id] }));
      setNewThoughtlineTitle("");
    }
  }

  async function handleCreateTag() {
    if (!newTagLabel.trim()) return;
    const res = await fetch("/api/admin/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newTagLabel.trim() }),
    });
    if (res.ok) {
      const tag = await res.json();
      setAllTags((prev) => [...prev, tag].sort((a, b) => a.label.localeCompare(b.label)));
      setForm((prev) => ({ ...prev, tags: [...prev.tags, tag.id] }));
      setNewTagLabel("");
    }
  }

  async function handlePublish() {
    setForm((prev) => ({ ...prev, status: "published" }));
    // flush will pick up the status change on next tick
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
            <a
              href={`/meditations/${meditationId}`}
              target="_blank"
              className="admin-btn"
            >
              View
            </a>
          )}
          {meditationId && (
            <button
              type="button"
              className="admin-btn admin-btn--danger"
              onClick={handleDelete}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {error && <p className="obsv-editor__error">{error}</p>}

      <div className="med-composer">
        <div className="med-composer__main">
          {/* Subtitle */}
          <input
            type="text"
            className="obsv-editor__input"
            placeholder="Subtitle (optional)"
            value={form.subtitle}
            onChange={(e) => setForm((prev) => ({ ...prev, subtitle: e.target.value }))}
            style={{ marginBottom: "var(--space-xs)" }}
          />

          {/* Toolbar */}
          <div className="med-composer__toolbar">
            <button type="button" className="med-composer__toolbar-btn" onClick={() => execCmd("bold")} title="Bold">
              <strong>B</strong>
            </button>
            <button type="button" className="med-composer__toolbar-btn" onClick={() => execCmd("italic")} title="Italic">
              <em>I</em>
            </button>
            <button type="button" className="med-composer__toolbar-btn" onClick={() => execCmd("underline")} title="Underline">
              <u>U</u>
            </button>
          </div>

          {/* Contenteditable */}
          <div
            ref={editorRef}
            className="med-composer__editor"
            contentEditable
            spellCheck
            onInput={handleInput}
            data-placeholder="Write a meditation..."
          />

          {/* Actions */}
          <div className="med-composer__actions">
            <span className={`autosave-status autosave-status--${autosaveStatus}`}>
              {autosaveStatus === "saving" && "Saving..."}
              {autosaveStatus === "saved" && "Saved"}
              {autosaveStatus === "error" && "Save failed"}
            </span>
            {form.status !== "published" && (
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                onClick={handlePublish}
              >
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

        {/* Sidebar — metadata pickers */}
        <div className="med-composer__sidebar">
          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">
              Status
            </h3>
            <select
              className="obsv-editor__input"
              value={form.status}
              onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
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

          <RelatedMusicPanel
            value={form.related_music}
            onChange={(val) => setForm((prev) => ({ ...prev, related_music: val }))}
          />
        </div>
      </div>
    </div>
  );
}
