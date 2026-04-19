"use client";

import { useState, useEffect, useCallback } from "react";

interface Redirect {
  id: string;
  from_path: string;
  to_path: string;
  status_code: number;
  source: "auto" | "manual";
  content_type: string | null;
  hits: number;
  last_hit_at: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

type SourceFilter = "" | "auto" | "manual";

export default function AdminRedirectsPage() {
  const [rows, setRows] = useState<Redirect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("");

  const [newFrom, setNewFrom] = useState("");
  const [newTo, setNewTo] = useState("");
  const [newCode, setNewCode] = useState(301);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFrom, setEditFrom] = useState("");
  const [editTo, setEditTo] = useState("");
  const [editCode, setEditCode] = useState(301);

  const fetchRows = useCallback(async () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (sourceFilter) params.set("source", sourceFilter);
    const res = await fetch(`/api/admin/redirects?${params.toString()}`);
    const data = await res.json();
    setRows(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [q, sourceFilter]);

  useEffect(() => {
    const t = setTimeout(fetchRows, 200);
    return () => clearTimeout(t);
  }, [fetchRows]);

  async function handleAdd() {
    if (!newFrom.trim() || !newTo.trim()) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/admin/redirects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from_path: newFrom.trim(),
        to_path: newTo.trim(),
        status_code: newCode,
      }),
    });
    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg || "Failed to add redirect");
    } else {
      setNewFrom("");
      setNewTo("");
      setNewCode(301);
      await fetchRows();
    }
    setSaving(false);
  }

  function startEdit(r: Redirect) {
    setEditingId(r.id);
    setEditFrom(r.from_path);
    setEditTo(r.to_path);
    setEditCode(r.status_code);
  }

  async function saveEdit() {
    if (!editingId) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/admin/redirects/${editingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from_path: editFrom.trim(),
        to_path: editTo.trim(),
        status_code: editCode,
      }),
    });
    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg || "Failed to save");
    } else {
      setEditingId(null);
      await fetchRows();
    }
    setSaving(false);
  }

  async function toggleActive(r: Redirect) {
    setError("");
    const res = await fetch(`/api/admin/redirects/${r.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !r.active }),
    });
    if (!res.ok) {
      const { error: msg } = await res.json();
      setError(msg || "Failed to toggle");
    } else {
      await fetchRows();
    }
  }

  async function handleDelete(r: Redirect) {
    if (!confirm(`Delete redirect from ${r.from_path}?`)) return;
    setError("");
    const res = await fetch(`/api/admin/redirects/${r.id}`, { method: "DELETE" });
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

  const total = rows.length;
  const autoCount = rows.filter((r) => r.source === "auto").length;
  const manualCount = rows.filter((r) => r.source === "manual").length;
  const totalHits = rows.reduce((s, r) => s + (r.hits || 0), 0);

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Redirects</h1>
      </div>

      <div className="admin-stats">
        <div className="admin-stats__card">
          <span className="admin-stats__value">{total}</span>
          <span className="admin-stats__label">Total</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{autoCount}</span>
          <span className="admin-stats__label">Auto</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{manualCount}</span>
          <span className="admin-stats__label">Manual</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{totalHits}</span>
          <span className="admin-stats__label">Hits</span>
        </div>
      </div>

      {error && <p className="obsv-editor__error">{error}</p>}

      {/* Add new */}
      <div className="admin-meta-form__add">
        <input
          className="admin-meta-form__input admin-meta-form__input--mono"
          type="text"
          placeholder="From path (e.g. /old-slug)"
          value={newFrom}
          onChange={(e) => setNewFrom(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <input
          className="admin-meta-form__input admin-meta-form__input--mono"
          type="text"
          placeholder="To path (e.g. /new-slug)"
          value={newTo}
          onChange={(e) => setNewTo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <select
          className="admin-meta-form__input"
          value={newCode}
          onChange={(e) => setNewCode(Number(e.target.value))}
          style={{ width: 90 }}
        >
          <option value={301}>301</option>
          <option value={302}>302</option>
          <option value={307}>307</option>
          <option value={308}>308</option>
        </select>
        <button
          className="admin-btn admin-btn--primary"
          onClick={handleAdd}
          disabled={saving || !newFrom.trim() || !newTo.trim()}
        >
          Add
        </button>
      </div>

      {/* Search + filter */}
      <div className="admin-meta-form__add" style={{ marginTop: "var(--space-sm)" }}>
        <input
          className="admin-meta-form__input"
          type="search"
          placeholder="Search from/to…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: 1 }}
        />
        <select
          className="admin-meta-form__input"
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
          style={{ width: 130 }}
        >
          <option value="">All sources</option>
          <option value="auto">Auto</option>
          <option value="manual">Manual</option>
        </select>
      </div>

      <table className="admin-table" style={{ marginTop: "var(--space-md)" }}>
        <thead>
          <tr>
            <th className="admin-table__th">From</th>
            <th className="admin-table__th">To</th>
            <th className="admin-table__th" style={{ width: 70 }}>Code</th>
            <th className="admin-table__th" style={{ width: 80 }}>Source</th>
            <th className="admin-table__th" style={{ width: 70 }}>Hits</th>
            <th className="admin-table__th" style={{ width: 80 }}>Active</th>
            <th className="admin-table__th" style={{ width: 170 }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr className="admin-table__row">
              <td
                className="admin-table__td"
                colSpan={7}
                style={{ textAlign: "center", color: "var(--text-tertiary)", fontStyle: "italic" }}
              >
                No redirects yet.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className="admin-table__row">
              {editingId === r.id ? (
                <>
                  <td className="admin-table__td">
                    <input
                      className="admin-meta-form__inline-input admin-meta-form__inline-input--mono"
                      value={editFrom}
                      onChange={(e) => setEditFrom(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                      autoFocus
                    />
                  </td>
                  <td className="admin-table__td">
                    <input
                      className="admin-meta-form__inline-input admin-meta-form__inline-input--mono"
                      value={editTo}
                      onChange={(e) => setEditTo(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                    />
                  </td>
                  <td className="admin-table__td">
                    <select
                      className="admin-meta-form__inline-input"
                      value={editCode}
                      onChange={(e) => setEditCode(Number(e.target.value))}
                    >
                      <option value={301}>301</option>
                      <option value={302}>302</option>
                      <option value={307}>307</option>
                      <option value={308}>308</option>
                    </select>
                  </td>
                  <td className="admin-table__td" style={{ color: "var(--text-tertiary)", fontSize: "0.8rem" }}>
                    {r.source}
                  </td>
                  <td className="admin-table__td" style={{ color: "var(--text-tertiary)", fontSize: "0.8rem" }}>
                    {r.hits}
                  </td>
                  <td className="admin-table__td">—</td>
                  <td className="admin-table__td" style={{ whiteSpace: "nowrap" }}>
                    <button
                      className="admin-btn admin-btn--primary"
                      onClick={saveEdit}
                      disabled={saving}
                      style={{ marginRight: 4 }}
                    >
                      Save
                    </button>
                    <button className="admin-btn" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </td>
                </>
              ) : (
                <>
                  <td
                    className="admin-table__td"
                    style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.8rem" }}
                  >
                    <span className="admin-table__link" style={{ cursor: "pointer" }} onClick={() => startEdit(r)}>
                      {r.from_path}
                    </span>
                  </td>
                  <td
                    className="admin-table__td"
                    style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.8rem" }}
                  >
                    {r.to_path}
                  </td>
                  <td className="admin-table__td" style={{ color: "var(--text-tertiary)", fontSize: "0.8rem" }}>
                    {r.status_code}
                  </td>
                  <td className="admin-table__td" style={{ color: "var(--text-tertiary)", fontSize: "0.8rem" }}>
                    {r.source}
                  </td>
                  <td className="admin-table__td" style={{ color: "var(--text-tertiary)", fontSize: "0.8rem" }}>
                    {r.hits}
                  </td>
                  <td className="admin-table__td">
                    <label style={{ display: "inline-flex", alignItems: "center", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={r.active}
                        onChange={() => toggleActive(r)}
                      />
                    </label>
                  </td>
                  <td className="admin-table__td" style={{ whiteSpace: "nowrap" }}>
                    <button className="admin-btn" onClick={() => startEdit(r)} style={{ marginRight: 4 }}>
                      Edit
                    </button>
                    <button className="admin-btn admin-btn--danger" onClick={() => handleDelete(r)}>
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
