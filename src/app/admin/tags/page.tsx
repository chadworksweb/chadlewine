"use client";

import { useState, useEffect, useCallback } from "react";

interface Tag {
  id: string;
  label: string;
  slug: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function AdminTagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchTags = useCallback(async () => {
    const res = await fetch("/api/admin/tags");
    const data = await res.json();
    setTags(data.sort((a: Tag, b: Tag) => a.label.localeCompare(b.label)));
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-side data load on mount
    fetchTags();
  }, [fetchTags]);

  async function handleAdd() {
    if (!newLabel.trim()) return;
    const slug = newSlug.trim() || slugify(newLabel);
    setSaving(true);
    setError("");
    const res = await fetch("/api/admin/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newLabel.trim(), slug }),
    });
    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg);
    } else {
      setNewLabel("");
      setNewSlug("");
      await fetchTags();
    }
    setSaving(false);
  }

  function startEdit(t: Tag) {
    setEditingId(t.id);
    setEditLabel(t.label);
    setEditSlug(t.slug);
  }

  async function saveEdit() {
    if (!editingId || !editLabel.trim() || !editSlug.trim()) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/admin/tags/${editingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: editLabel.trim(), slug: editSlug.trim() }),
    });
    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg);
    } else {
      setEditingId(null);
      await fetchTags();
    }
    setSaving(false);
  }

  async function handleDelete(t: Tag) {
    if (!confirm(`Delete "${t.label}"? This cannot be undone.`)) return;
    setError("");
    const res = await fetch(`/api/admin/tags/${t.id}`, { method: "DELETE" });
    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg);
    } else {
      await fetchTags();
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
        <h1 className="admin-page__title">Tags</h1>
      </div>

      <div className="admin-stats">
        <div className="admin-stats__card">
          <span className="admin-stats__value">{tags.length}</span>
          <span className="admin-stats__label">Total</span>
        </div>
      </div>

      {error && <p className="obsv-editor__error">{error}</p>}

      {/* Add new tag */}
      <div className="admin-meta-form__add">
        <input
          className="admin-meta-form__input"
          type="text"
          placeholder="Label (e.g. Music)"
          value={newLabel}
          onChange={(e) => {
            setNewLabel(e.target.value);
            if (!newSlug || newSlug === slugify(newLabel)) {
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
        <button
          className="admin-btn admin-btn--primary"
          onClick={handleAdd}
          disabled={saving || !newLabel.trim()}
        >
          Add
        </button>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th className="admin-table__th">Label</th>
            <th className="admin-table__th">Slug</th>
            <th className="admin-table__th" style={{ width: 160 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {tags.map((t) => (
            <tr key={t.id} className="admin-table__row">
              {editingId === t.id ? (
                <>
                  <td className="admin-table__td">
                    <input
                      className="admin-meta-form__inline-input"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
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
                      {t.label}
                    </span>
                  </td>
                  <td className="admin-table__td" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
                    {t.slug}
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
