"use client";

import { useState, useEffect, useCallback } from "react";

interface Domain {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function AdminDomainsPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchDomains = useCallback(async () => {
    const res = await fetch("/api/admin/domains");
    const data = await res.json();
    setDomains(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  async function handleAdd() {
    if (!newLabel.trim()) return;
    const slug = newSlug.trim() || slugify(newLabel);
    setSaving(true);
    setError("");
    const res = await fetch("/api/admin/domains", {
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
      await fetchDomains();
    }
    setSaving(false);
  }

  function startEdit(d: Domain) {
    setEditingId(d.id);
    setEditLabel(d.label);
    setEditSlug(d.slug);
  }

  async function saveEdit() {
    if (!editingId || !editLabel.trim() || !editSlug.trim()) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/admin/domains/${editingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: editLabel.trim(), slug: editSlug.trim() }),
    });
    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg);
    } else {
      setEditingId(null);
      await fetchDomains();
    }
    setSaving(false);
  }

  async function handleDelete(d: Domain) {
    if (!confirm(`Delete "${d.label}"? This cannot be undone.`)) return;
    setError("");
    const res = await fetch(`/api/admin/domains/${d.id}`, { method: "DELETE" });
    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg);
    } else {
      await fetchDomains();
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
        <h1 className="admin-page__title">Domains</h1>
      </div>

      <div className="admin-stats">
        <div className="admin-stats__card">
          <span className="admin-stats__value">{domains.length}</span>
          <span className="admin-stats__label">Total</span>
        </div>
      </div>

      {error && <p className="obs-editor__error">{error}</p>}

      {/* Add new domain */}
      <div className="admin-domains__add">
        <input
          className="admin-domains__input"
          type="text"
          placeholder="Label (e.g. Social Media)"
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
          className="admin-domains__input admin-domains__input--slug"
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
            <th className="admin-table__th">#</th>
            <th className="admin-table__th">Label</th>
            <th className="admin-table__th">Slug</th>
            <th className="admin-table__th" style={{ width: 120 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {domains.map((d) => (
            <tr key={d.id} className="admin-table__row">
              <td className="admin-table__td" style={{ width: 50, color: "var(--text-tertiary)" }}>
                {d.sort_order}
              </td>
              {editingId === d.id ? (
                <>
                  <td className="admin-table__td">
                    <input
                      className="admin-domains__inline-input"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                      autoFocus
                    />
                  </td>
                  <td className="admin-table__td">
                    <input
                      className="admin-domains__inline-input admin-domains__inline-input--mono"
                      value={editSlug}
                      onChange={(e) => setEditSlug(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                    />
                  </td>
                  <td className="admin-table__td">
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
                    <span className="admin-table__link" style={{ cursor: "pointer" }} onClick={() => startEdit(d)}>
                      {d.label}
                    </span>
                  </td>
                  <td className="admin-table__td" style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
                    {d.slug}
                  </td>
                  <td className="admin-table__td">
                    <button
                      className="admin-btn"
                      onClick={() => startEdit(d)}
                      style={{ marginRight: 4 }}
                    >
                      Edit
                    </button>
                    <button
                      className="admin-btn admin-btn--danger"
                      onClick={() => handleDelete(d)}
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
