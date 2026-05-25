"use client";

import { useCallback, useEffect, useState } from "react";
import { CREDIT_ROLES, CREDIT_ROLE_LABEL, creditRoleLabel, type CreditRole } from "@/lib/song-credits";
import "./EntityPicker.css";

interface CreditRow {
  id: string;
  song_id: string;
  role: string;
  name: string;
  display_order: number;
}

// Inline CRUD for a song's credit lines (role + name), embedded in SongEditor.
// Backed by /api/admin/song-credits. Mirrors EntityPicker's add/remove/reorder
// shape so the admin UX is consistent.
export function CreditsEditor({ songId }: { songId: string }) {
  const [rows, setRows] = useState<CreditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<CreditRole>(CREDIT_ROLES[0]);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const base = "/api/admin/song-credits";

  const load = useCallback(() => {
    fetch(`${base}?song_id=${encodeURIComponent(songId)}`)
      .then((r) => r.json())
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [songId]);

  useEffect(() => { load(); }, [load]);

  async function add() {
    if (!name.trim() || saving) return;
    setSaving(true);
    await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ song_id: songId, role, name: name.trim() }),
    });
    setName("");
    setSaving(false);
    load();
  }

  async function remove(id: string) {
    await fetch(`${base}/${id}`, { method: "DELETE" });
    load();
  }

  async function updateRole(id: string, newRole: CreditRole) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, role: newRole } : r)));
    await fetch(`${base}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
  }

  async function updateName(id: string, newName: string) {
    if (!newName.trim()) return;
    await fetch(`${base}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    });
  }

  async function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[idx], next[j]] = [next[j], next[idx]];
    setRows(next);
    await fetch(base, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: next.map((r) => r.id) }),
    });
  }

  if (loading) return <p className="entity-picker__status">Loading...</p>;

  return (
    <div className="entity-picker">
      {rows.length === 0 && <p className="entity-picker__empty">No credits yet.</p>}

      {rows.length > 0 && (
        <ul className="entity-picker__list">
          {rows.map((r, i) => (
            <li key={r.id} className="entity-picker__item">
              <select
                className="obsv-editor__input"
                style={{ maxWidth: "11rem" }}
                value={CREDIT_ROLES.includes(r.role as CreditRole) ? r.role : ""}
                onChange={(e) => updateRole(r.id, e.target.value as CreditRole)}
              >
                {!CREDIT_ROLES.includes(r.role as CreditRole) && (
                  <option value="">{creditRoleLabel(r.role)}</option>
                )}
                {CREDIT_ROLES.map((role) => (
                  <option key={role} value={role}>{CREDIT_ROLE_LABEL[role]}</option>
                ))}
              </select>
              <input
                type="text"
                className="obsv-editor__input"
                defaultValue={r.name}
                onBlur={(e) => updateName(r.id, e.target.value)}
                style={{ flex: 1 }}
              />
              <div className="entity-picker__controls">
                <button type="button" className="admin-btn admin-btn--small" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">up</button>
                <button type="button" className="admin-btn admin-btn--small" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Move down">down</button>
                <button type="button" className="admin-btn admin-btn--small admin-btn--danger" onClick={() => remove(r.id)}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="entity-picker__add" style={{ display: "flex", gap: "0.5rem", alignItems: "stretch" }}>
        <select
          className="obsv-editor__input"
          style={{ maxWidth: "11rem" }}
          value={role}
          onChange={(e) => setRole(e.target.value as CreditRole)}
        >
          {CREDIT_ROLES.map((r) => (
            <option key={r} value={r}>{CREDIT_ROLE_LABEL[r]}</option>
          ))}
        </select>
        <input
          type="text"
          className="obsv-editor__input"
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          style={{ flex: 1 }}
        />
        <button type="button" className="admin-btn admin-btn--small" onClick={add} disabled={!name.trim() || saving}>
          Add
        </button>
      </div>
    </div>
  );
}
