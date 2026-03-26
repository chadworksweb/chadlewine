"use client";

import { useState, useEffect, useCallback } from "react";

interface Category {
  id: string;
  title: string;
  slug: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchCategories = useCallback(async () => {
    const res = await fetch("/api/admin/categories");
    const data = await res.json();
    setCategories(data.sort((a: Category, b: Category) => a.title.localeCompare(b.title)));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  async function handleAdd() {
    if (!newTitle.trim()) return;
    const slug = newSlug.trim() || slugify(newTitle);
    setSaving(true);
    setError("");
    const res = await fetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim(), slug }),
    });
    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg);
    } else {
      setNewTitle("");
      setNewSlug("");
      await fetchCategories();
    }
    setSaving(false);
  }

  function startEdit(c: Category) {
    setEditingId(c.id);
    setEditTitle(c.title);
    setEditSlug(c.slug);
  }

  async function saveEdit() {
    if (!editingId || !editTitle.trim() || !editSlug.trim()) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/admin/categories/${editingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle.trim(), slug: editSlug.trim() }),
    });
    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg);
    } else {
      setEditingId(null);
      await fetchCategories();
    }
    setSaving(false);
  }

  async function handleDelete(c: Category) {
    if (!confirm(`Delete "${c.title}"? This cannot be undone.`)) return;
    setError("");
    const res = await fetch(`/api/admin/categories/${c.id}`, { method: "DELETE" });
    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg);
    } else {
      await fetchCategories();
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
        <h1 className="admin-page__title">Categories</h1>
      </div>

      <div className="admin-stats">
        <div className="admin-stats__card">
          <span className="admin-stats__value">{categories.length}</span>
          <span className="admin-stats__label">Total</span>
        </div>
      </div>

      {error && <p className="obsv-editor__error">{error}</p>}

      <div className="admin-meta-form__add">
        <input
          className="admin-meta-form__input"
          type="text"
          placeholder="Title (e.g. Social Media)"
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
            <th className="admin-table__th" style={{ width: 160 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((c) => (
            <tr key={c.id} className="admin-table__row">
              {editingId === c.id ? (
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
                    <span className="admin-table__link" style={{ cursor: "pointer" }} onClick={() => startEdit(c)}>
                      {c.title}
                    </span>
                  </td>
                  <td className="admin-table__td" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
                    {c.slug}
                  </td>
                  <td className="admin-table__td" style={{ whiteSpace: "nowrap" }}>
                    <button
                      className="admin-btn"
                      onClick={() => startEdit(c)}
                      style={{ marginRight: 4 }}
                    >
                      Edit
                    </button>
                    <button
                      className="admin-btn admin-btn--danger"
                      onClick={() => handleDelete(c)}
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
