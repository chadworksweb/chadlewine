"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

interface Collection {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  status: "active" | "archived";
  sort_order: number;
  product_count: number;
  created_at: string;
  updated_at: string;
}

export default function AdminCollectionsPage() {
  const [rows, setRows] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    const res = await fetch("/api/admin/collections");
    const data = await res.json();
    setRows(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  async function handleAdd() {
    if (!newTitle.trim()) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/admin/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTitle.trim(),
        slug: newSlug.trim() || undefined,
      }),
    });
    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg || "Failed to create collection");
    } else {
      setNewTitle("");
      setNewSlug("");
      await fetchRows();
    }
    setSaving(false);
  }

  async function handleDelete(c: Collection) {
    if (!confirm(`Delete collection "${c.title}"? Product assignments will be removed too.`)) return;
    setError("");
    const res = await fetch(`/api/admin/collections/${c.id}`, { method: "DELETE" });
    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg || "Failed to delete");
    } else {
      await fetchRows();
    }
  }

  if (loading) {
    return (
      <div className="admin-page">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Collections</h1>
      </div>

      <p style={{ color: "var(--text-tertiary)", fontSize: "0.9rem", marginBottom: "var(--space-md)" }}>
        Curated sets of products. A product can live in multiple collections. Used by marketing-angle landing pages (e.g. <code>/super-individual</code>).
      </p>

      {error && <p className="obsv-editor__error">{error}</p>}

      <div className="admin-meta-form__add">
        <input
          className="admin-meta-form__input"
          type="text"
          placeholder="Collection title"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          style={{ flex: 1 }}
        />
        <input
          className="admin-meta-form__input admin-meta-form__input--mono"
          type="text"
          placeholder="slug (optional)"
          value={newSlug}
          onChange={(e) => setNewSlug(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          style={{ width: 200 }}
        />
        <button
          className="admin-btn admin-btn--primary"
          onClick={handleAdd}
          disabled={saving || !newTitle.trim()}
        >
          Add
        </button>
      </div>

      <table className="admin-table" style={{ marginTop: "var(--space-md)" }}>
        <thead>
          <tr>
            <th className="admin-table__th">Title</th>
            <th className="admin-table__th">Slug</th>
            <th className="admin-table__th" style={{ width: 90 }}>Products</th>
            <th className="admin-table__th" style={{ width: 90 }}>Status</th>
            <th className="admin-table__th" style={{ width: 170 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr className="admin-table__row">
              <td className="admin-table__td" colSpan={5} style={{ textAlign: "center", color: "var(--text-tertiary)", fontStyle: "italic" }}>
                No collections yet.
              </td>
            </tr>
          )}
          {rows.map((c) => (
            <tr key={c.id} className="admin-table__row">
              <td className="admin-table__td">
                <Link href={`/admin/collections/${c.id}`} className="admin-table__link">
                  {c.title}
                </Link>
              </td>
              <td className="admin-table__td" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
                {c.slug}
              </td>
              <td className="admin-table__td" style={{ color: "var(--text-tertiary)" }}>
                {c.product_count}
              </td>
              <td className="admin-table__td" style={{ color: "var(--text-tertiary)", fontSize: "0.8rem" }}>
                {c.status}
              </td>
              <td className="admin-table__td" style={{ whiteSpace: "nowrap" }}>
                <Link href={`/admin/collections/${c.id}`} className="admin-btn" style={{ marginRight: 4 }}>
                  Edit
                </Link>
                <button className="admin-btn admin-btn--danger" onClick={() => handleDelete(c)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
