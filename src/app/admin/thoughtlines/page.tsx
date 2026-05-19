"use client";

import { useState, useEffect, useCallback } from "react";

interface Thoughtline {
  id: string;
  title: string;
  slug: string;
  description: string | null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function AdminThoughtlinesPage() {
  const [thoughtlines, setThoughtlines] = useState<Thoughtline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchThoughtlines = useCallback(async () => {
    const res = await fetch("/api/admin/thoughtlines");
    const data = await res.json();
    setThoughtlines(data.sort((a: Thoughtline, b: Thoughtline) => a.title.localeCompare(b.title)));
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-side data load on mount
    fetchThoughtlines();
  }, [fetchThoughtlines]);

  async function handleAdd() {
    if (!newTitle.trim()) return;
    const slug = newSlug.trim() || slugify(newTitle);
    setSaving(true);
    setError("");
    const res = await fetch("/api/admin/thoughtlines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim(), slug, description: newDescription.trim() || null }),
    });
    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg);
    } else {
      setNewTitle("");
      setNewSlug("");
      setNewDescription("");
      await fetchThoughtlines();
    }
    setSaving(false);
  }

  function startEdit(t: Thoughtline) {
    setEditingId(t.id);
    setEditTitle(t.title);
    setEditSlug(t.slug);
    setEditDescription(t.description || "");
  }

  async function saveEdit() {
    if (!editingId || !editTitle.trim() || !editSlug.trim()) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/admin/thoughtlines/${editingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle.trim(), slug: editSlug.trim(), description: editDescription.trim() || null }),
    });
    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg);
    } else {
      setEditingId(null);
      await fetchThoughtlines();
    }
    setSaving(false);
  }

  async function handleDelete(t: Thoughtline) {
    if (!confirm(`Delete "${t.title}"? This cannot be undone.`)) return;
    setError("");
    const res = await fetch(`/api/admin/thoughtlines/${t.id}`, { method: "DELETE" });
    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg);
    } else {
      await fetchThoughtlines();
    }
  }

  if (loading) {
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
        <h1 className="admin-page__title">Thoughtlines</h1>
      </div>

      <div className="admin-stats">
        <div className="admin-stats__card">
          <span className="admin-stats__value">{thoughtlines.length}</span>
          <span className="admin-stats__label">Total</span>
        </div>
      </div>

      {error && <p className="obsv-editor__error">{error}</p>}

      <div className="admin-meta-form__add">
        <input
          className="admin-meta-form__input"
          type="text"
          placeholder="Title (e.g. lack of validation from institutions)"
          value={newTitle}
          onChange={(e) => {
            setNewTitle(e.target.value);
            if (!newSlug || newSlug === slugify(newTitle)) {
              setNewSlug(slugify(e.target.value));
            }
          }}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <input
          className="admin-meta-form__input admin-meta-form__input--slug"
          type="text"
          placeholder="slug"
          value={newSlug}
          onChange={(e) => setNewSlug(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <input
          className="admin-meta-form__input"
          type="text"
          placeholder="Description (optional)"
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <button
          className="admin-btn admin-btn--primary"
          onClick={handleAdd}
          disabled={saving || !newTitle.trim()}
        >
          Add
        </button>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th className="admin-table__th">Title</th>
            <th className="admin-table__th">Slug</th>
            <th className="admin-table__th">Description</th>
            <th className="admin-table__th" style={{ width: 160 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {thoughtlines.map((t) => (
            <tr key={t.id} className="admin-table__row">
              {editingId === t.id ? (
                <>
                  <td className="admin-table__td">
                    <input
                      className="admin-meta-form__inline-input"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                      autoFocus
                    />
                  </td>
                  <td className="admin-table__td">
                    <input
                      className="admin-meta-form__inline-input admin-meta-form__inline-input--mono"
                      value={editSlug}
                      onChange={(e) => setEditSlug(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                    />
                  </td>
                  <td className="admin-table__td">
                    <input
                      className="admin-meta-form__inline-input"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                      placeholder="Description (optional)"
                    />
                  </td>
                  <td className="admin-table__td" style={{ whiteSpace: "nowrap" }}>
                    <button
                      className="admin-btn admin-btn--primary"
                      onClick={saveEdit}
                      disabled={saving}
                      style={{ marginRight: 4 }}
                    >
                      Save
                    </button>
                    <button
                      className="admin-btn"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </button>
                  </td>
                </>
              ) : (
                <>
                  <td className="admin-table__td">
                    <span className="admin-table__link" style={{ cursor: "pointer" }} onClick={() => startEdit(t)}>
                      {t.title}
                    </span>
                  </td>
                  <td className="admin-table__td" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
                    {t.slug}
                  </td>
                  <td className="admin-table__td" style={{ fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
                    {t.description || "\u2014"}
                  </td>
                  <td className="admin-table__td" style={{ whiteSpace: "nowrap" }}>
                    <button
                      className="admin-btn"
                      onClick={() => startEdit(t)}
                      style={{ marginRight: 4 }}
                    >
                      Edit
                    </button>
                    <button
                      className="admin-btn admin-btn--danger"
                      onClick={() => handleDelete(t)}
                    >
                      Delete
                    </button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
