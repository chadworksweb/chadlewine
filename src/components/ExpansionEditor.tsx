"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { slugify } from "@/lib/utils";
import { useAutosave } from "@/hooks/useAutosave";

interface ExpansionData {
  id?: string;
  song_id: string;
  title: string;
  slug: string;
  body: string;
  status: string;
  display_order: number;
}

const emptyExpansion = (songId: string): ExpansionData => ({
  song_id: songId,
  title: "",
  slug: "",
  body: "",
  status: "draft",
  display_order: 0,
});

export function ExpansionEditor({
  initial,
  songId,
  songTitle,
}: {
  initial?: ExpansionData;
  songId: string;
  songTitle?: string;
}) {
  const router = useRouter();
  const [form, setForm] = useState<ExpansionData>(initial || emptyExpansion(songId));

  const set = useCallback((field: keyof ExpansionData, value: unknown) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  function handleTitleChange(value: string) {
    set("title", value);
    if (!form.id) {
      set("slug", slugify(value));
    }
  }

  const buildPayload = useCallback(
    (d: ExpansionData) => ({
      song_id: d.song_id,
      title: d.title,
      slug: d.slug,
      body: d.body,
      status: d.status,
      display_order: d.display_order,
    }),
    []
  );

  const { status: autosaveStatus } = useAutosave({
    data: form,
    endpoint: "/api/admin/expansions",
    id: form.id,
    buildPayload,
    onCreated: (newId) => {
      setForm((prev) => ({ ...prev, id: newId }));
      router.replace(`/admin/music/songs/${songId}/expansions/${newId}`, { scroll: false });
    },
    enabled: !!form.title && !!form.song_id,
  });

  async function handleDelete() {
    if (!form.id) return;
    if (!confirm("Delete this expansion? This cannot be undone.")) return;
    const res = await fetch(`/api/admin/expansions/${form.id}`, { method: "DELETE" });
    if (res.ok) router.push(`/admin/music/songs/${songId}`);
  }

  return (
    <div className="obsv-editor">
      <div className="obsv-editor__header">
        <h1 className="admin-page__title">
          {!form.id ? "New Expansion" : "Edit Expansion"}
        </h1>
        <div className="obsv-editor__actions">
          {form.id && (
            <button
              className="admin-btn admin-btn--danger"
              onClick={handleDelete}
              type="button"
            >
              Delete
            </button>
          )}
          <span className={`autosave-status autosave-status--${autosaveStatus}`}>
            {autosaveStatus === "saving" && "Saving..."}
            {autosaveStatus === "saved" && "Saved"}
            {autosaveStatus === "error" && "Save failed"}
          </span>
        </div>
      </div>

      {songTitle && (
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", margin: "0 0 1.5rem" }}>
          Song: {songTitle}
        </p>
      )}

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
            <label className="obsv-editor__label" htmlFor="body">Body</label>
            <textarea
              id="body"
              className="obsv-editor__input"
              value={form.body}
              onChange={(e) => set("body", e.target.value)}
              rows={24}
              style={{ fontFamily: "var(--font-mono)", whiteSpace: "pre-wrap" }}
              placeholder="Deep-dive breakdown..."
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="obsv-editor__sidebar">
          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Publish</h3>
            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="status">Status</label>
              <select
                id="status"
                className="obsv-editor__input"
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>

          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Display</h3>
            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="display_order">Display Order</label>
              <input
                id="display_order"
                className="obsv-editor__input"
                type="number"
                min={0}
                value={form.display_order}
                onChange={(e) => set("display_order", parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
