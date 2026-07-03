"use client";

import { useCallback, useEffect, useState } from "react";

interface Entry {
  id: string;
  entity_type: "song" | "release" | "merch" | "observation" | "art" | "video";
  entity_id: string;
  display_order: number;
  title: string;
  slug: string | null;
}

interface LookupRow {
  id: string;
  title: string;
  slug: string | null;
}

const ENTITY_TYPES = ["song", "release", "merch", "observation", "art", "video"] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

export default function HomepageHeroAdmin() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [addType, setAddType] = useState<EntityType>("song");
  const [pickerOptions, setPickerOptions] = useState<LookupRow[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [saving, setSaving] = useState(false);
  const [slideCount, setSlideCount] = useState("");
  const [slideSaved, setSlideSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/homepage-hero");
    if (res.ok) setEntries(await res.json());
    setLoading(false);
  }, []);

  const loadSlideCount = useCallback(async () => {
    const res = await fetch("/api/admin/site-settings");
    if (res.ok) {
      const s = await res.json();
      setSlideCount(s.hero_slide_count || "10");
    }
  }, []);

  async function saveSlideCount(raw: string) {
    const n = Math.max(1, Math.min(15, parseInt(raw, 10) || 10));
    setSlideCount(String(n));
    await fetch("/api/admin/site-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hero_slide_count: String(n) }),
    });
    setSlideSaved(true);
    setTimeout(() => setSlideSaved(false), 1500);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-side data load on mount
    load();
    loadSlideCount();
  }, [load, loadSlideCount]);

  const loadPicker = useCallback(async (type: EntityType) => {
    setPickerLoading(true);
    setSelectedId("");
    const res = await fetch(`/api/admin/homepage-hero/lookup?type=${type}`);
    if (res.ok) setPickerOptions(await res.json());
    setPickerLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-side data load when picker type changes
    loadPicker(addType);
  }, [addType, loadPicker]);

  async function handleAdd() {
    if (!selectedId) return;
    setSaving(true);
    const res = await fetch("/api/admin/homepage-hero", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity_type: addType, entity_id: selectedId }),
    });
    setSaving(false);
    if (res.ok) {
      setSelectedId("");
      await load();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || "Failed to add");
    }
  }

  async function handleRemove(id: string) {
    if (!confirm("Remove from homepage hero?")) return;
    const res = await fetch(`/api/admin/homepage-hero/${id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  async function move(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= entries.length) return;
    const a = entries[index];
    const b = entries[next];
    // Swap display_order. Use the other row's order so we don't have to
    // renumber the whole list every time.
    await Promise.all([
      fetch(`/api/admin/homepage-hero/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_order: b.display_order }),
      }),
      fetch(`/api/admin/homepage-hero/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_order: a.display_order }),
      }),
    ]);
    await load();
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Homepage Hero</h1>
      </div>

      <p className="admin-empty" style={{ marginBottom: "1rem" }}>
        Pin entities to the homepage hero carousel. Your pins lead, then the
        latest songs backfill the rest up to the slide count below. Order
        top-to-bottom is the order shown on the site. To show ONLY your pins,
        set the slide count to the number of pins.
      </p>

      <div className="obsv-editor__field" style={{ maxWidth: 260, marginBottom: "1.5rem" }}>
        <label className="obsv-editor__label">
          Number of slides {slideSaved && <span style={{ color: "var(--text-accent)" }}>· saved</span>}
        </label>
        <input
          type="number"
          min={1}
          max={15}
          className="obsv-editor__input"
          value={slideCount}
          onChange={(e) => setSlideCount(e.target.value)}
          onBlur={(e) => saveSlideCount(e.target.value)}
        />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "end",
          gap: "0.75rem",
          marginBottom: "1.5rem",
          padding: "1rem",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 8,
          flexWrap: "wrap",
        }}
      >
        <div className="obsv-editor__field" style={{ minWidth: 140 }}>
          <label className="obsv-editor__label">Type</label>
          <select
            className="obsv-editor__input"
            value={addType}
            onChange={(e) => setAddType(e.target.value as EntityType)}
          >
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="obsv-editor__field" style={{ flex: 1, minWidth: 280 }}>
          <label className="obsv-editor__label">Entity</label>
          <select
            className="obsv-editor__input"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            disabled={pickerLoading}
          >
            <option value="">{pickerLoading ? "Loading…" : "— pick one —"}</option>
            {pickerOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title}
              </option>
            ))}
          </select>
        </div>

        <button
          className="admin-btn admin-btn--primary"
          onClick={handleAdd}
          disabled={!selectedId || saving}
        >
          {saving ? "Adding…" : "Add to Hero"}
        </button>
      </div>

      {loading && <p className="admin-empty">Loading…</p>}

      {!loading && entries.length === 0 && (
        <p className="admin-empty">
          No curated entries — homepage is using the latest-songs fallback.
        </p>
      )}

      {!loading && entries.length > 0 && (
        <table className="admin-table">
          <thead>
            <tr>
              <th className="admin-table__th" style={{ width: 100 }}>
                Order
              </th>
              <th className="admin-table__th" style={{ width: 120 }}>
                Type
              </th>
              <th className="admin-table__th">Title</th>
              <th className="admin-table__th" style={{ width: 200 }}>
                Slug
              </th>
              <th className="admin-table__th" style={{ width: 140 }}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={e.id} className="admin-table__row">
                <td className="admin-table__td">
                  <button
                    className="admin-btn"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    style={{ marginRight: 4, padding: "2px 8px" }}
                    aria-label="Move up"
                  >
                    ↑
                  </button>
                  <button
                    className="admin-btn"
                    onClick={() => move(i, 1)}
                    disabled={i === entries.length - 1}
                    style={{ padding: "2px 8px" }}
                    aria-label="Move down"
                  >
                    ↓
                  </button>
                </td>
                <td className="admin-table__td" style={{ textTransform: "uppercase" }}>
                  {e.entity_type}
                </td>
                <td className="admin-table__td">{e.title}</td>
                <td className="admin-table__td" style={{ color: "var(--text-tertiary)" }}>
                  {e.slug ?? "—"}
                </td>
                <td className="admin-table__td">
                  <button
                    className="admin-btn admin-btn--danger"
                    onClick={() => handleRemove(e.id)}
                    style={{ padding: "2px 10px" }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
