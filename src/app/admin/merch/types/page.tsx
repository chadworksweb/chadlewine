"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface MerchType {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
  item_count: number;
}

const RESERVED_SLUGS = new Set(["physical_music"]);

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export default function AdminMerchTypesPage() {
  const [types, setTypes] = useState<MerchType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editSort, setEditSort] = useState(0);
  const [newLabel, setNewLabel] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchTypes = useCallback(async () => {
    const res = await fetch("/api/admin/merch-types");
    const data = await res.json();
    setTypes(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-side data load on mount
    fetchTypes();
  }, [fetchTypes]);

  async function handleAdd() {
    if (!newLabel.trim()) return;
    const slug = newSlug.trim() || toSlug(newLabel);
    setSaving(true);
    setError("");
    const res = await fetch("/api/admin/merch-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: newLabel.trim(), slug, sort_order: 100 }),
    });
    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg || "Save failed");
    } else {
      setNewLabel("");
      setNewSlug("");
      await fetchTypes();
    }
    setSaving(false);
  }

  function startEdit(t: MerchType) {
    setEditingId(t.id);
    setEditLabel(t.label);
    setEditSlug(t.slug);
    setEditSort(t.sort_order);
  }

  async function saveEdit() {
    if (!editingId || !editLabel.trim() || !editSlug.trim()) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/admin/merch-types/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: editLabel.trim(),
        slug: editSlug.trim(),
        sort_order: editSort,
      }),
    });
    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg || "Save failed");
    } else {
      setEditingId(null);
      await fetchTypes();
    }
    setSaving(false);
  }

  async function handleDelete(t: MerchType) {
    if (!confirm(`Delete merch type "${t.label}"?`)) return;
    setError("");
    const res = await fetch(`/api/admin/merch-types/${t.id}`, { method: "DELETE" });
    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg || "Delete failed");
    } else {
      await fetchTypes();
    }
  }

  if (loading) {
    return (
      <div className="admin-page">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Merch Types</h1>
        <Link href="/admin/merch" className="admin-btn admin-btn--secondary">Back to Merch</Link>
      </div>

      <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)", fontSize: 13, marginTop: 0 }}>
        Categories used to group products on the storefront. <code>physical_music</code> is reserved -- release_skus with format vinyl, cd, or cassette belong to it automatically.
      </p>

      {error && <p className="obsv-editor__error">{error}</p>}

      <div className="admin-meta-form__add">
        <input
          className="admin-meta-form__input"
          type="text"
          placeholder="Label (e.g. Stickers)"
          value={newLabel}
          onChange={(e) => {
            setNewLabel(e.target.value);
            if (!newSlug || newSlug === toSlug(newLabel)) {
              setNewSlug(toSlug(e.target.value));
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
            <th className="admin-table__th" style={{ width: 80 }}>Items</th>
            <th className="admin-table__th" style={{ width: 80 }}>Sort</th>
            <th className="admin-table__th" style={{ width: 200 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {types.map((t) => {
            const reserved = RESERVED_SLUGS.has(t.slug);
            return (
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
                        disabled={reserved}
                        title={reserved ? "Slug is reserved" : ""}
                      />
                    </td>
                    <td className="admin-table__td">{t.item_count}</td>
                    <td className="admin-table__td">
                      <input
                        className="admin-meta-form__inline-input"
                        type="number"
                        value={editSort}
                        onChange={(e) => setEditSort(parseInt(e.target.value, 10) || 0)}
                        onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                      />
                    </td>
                    <td className="admin-table__td" style={{ whiteSpace: "nowrap" }}>
                      <button className="admin-btn admin-btn--primary" onClick={saveEdit} disabled={saving} style={{ marginRight: 4 }}>Save</button>
                      <button className="admin-btn" onClick={() => setEditingId(null)}>Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="admin-table__td">
                      <span className="admin-table__link" style={{ cursor: "pointer" }} onClick={() => startEdit(t)}>{t.label}</span>
                      {reserved && (
                        <span className="admin-meta-chip" style={{ marginLeft: 8 }}>reserved</span>
                      )}
                    </td>
                    <td className="admin-table__td" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
                      {t.slug}
                    </td>
                    <td className="admin-table__td">{t.item_count}</td>
                    <td className="admin-table__td">{t.sort_order}</td>
                    <td className="admin-table__td" style={{ whiteSpace: "nowrap" }}>
                      <button className="admin-btn" onClick={() => startEdit(t)} style={{ marginRight: 4 }}>Edit</button>
                      <button
                        className="admin-btn admin-btn--danger"
                        onClick={() => handleDelete(t)}
                        disabled={reserved}
                        title={reserved ? "Reserved type cannot be deleted" : ""}
                      >
                        Delete
                      </button>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
