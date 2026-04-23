"use client";

import { useEffect, useState } from "react";

type MuralDetails = {
  street_address: string | null;
  venue_name: string | null;
  venue_type: string | null;
  venue_url: string | null;
  neighborhood: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  width_ft: number | null;
  height_ft: number | null;
  indoor: boolean | null;
  completion_date: string | null;
  wall_status: string | null;
  viewable_hours: string | null;
  commissioned_by: string | null;
  public_topics: string[] | null;
};

const EMPTY: MuralDetails = {
  street_address: null, venue_name: null, venue_type: null, venue_url: null,
  neighborhood: null, city: null, region: null, country: "US",
  latitude: null, longitude: null, width_ft: null, height_ft: null, indoor: null,
  completion_date: null, wall_status: "active", viewable_hours: null,
  commissioned_by: null, public_topics: [],
};

export function MuralDetailsEditor({ slug }: { slug: string }) {
  const [form, setForm] = useState<MuralDetails | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/art/${slug}/mural`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setForm(data ? { ...EMPTY, ...data } : { ...EMPTY });
      })
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => { cancelled = true; };
  }, [slug]);

  async function save() {
    if (!form) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/art/${slug}/mural`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Save failed");
    }
  }

  if (!form) return <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading mural details…</p>;

  const set = (patch: Partial<MuralDetails>) => setForm({ ...form, ...patch });
  const str = (k: keyof MuralDetails): string => {
    const v = form[k];
    return v == null ? "" : String(v);
  };
  const numOrNull = (v: string): number | null => {
    if (v.trim() === "") return null;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };
  const topics = Array.isArray(form.public_topics) ? form.public_topics : [];

  return (
    <div>
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      <div className="obsv-editor__field"><label className="obsv-editor__label">Venue Name</label><input className="obsv-editor__input" value={str("venue_name")} onChange={e => set({ venue_name: e.target.value || null })} placeholder="e.g. Wake Coffee" /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Venue Type</label><input className="obsv-editor__input" value={str("venue_type")} onChange={e => set({ venue_type: e.target.value || null })} placeholder="coffee shop, retail, bar" /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Venue URL</label><input className="obsv-editor__input" value={str("venue_url")} onChange={e => set({ venue_url: e.target.value || null })} placeholder="https://…" /></div>

      <div className="obsv-editor__field"><label className="obsv-editor__label">Street Address</label><input className="obsv-editor__input" value={str("street_address")} onChange={e => set({ street_address: e.target.value || null })} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Neighborhood</label><input className="obsv-editor__input" value={str("neighborhood")} onChange={e => set({ neighborhood: e.target.value || null })} placeholder="e.g. Fashion District" /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">City</label><input className="obsv-editor__input" value={str("city")} onChange={e => set({ city: e.target.value || null })} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Region (state/province)</label><input className="obsv-editor__input" value={str("region")} onChange={e => set({ region: e.target.value || null })} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Country</label><input className="obsv-editor__input" value={str("country")} onChange={e => set({ country: e.target.value || null })} /></div>

      <div className="obsv-editor__field"><label className="obsv-editor__label">Latitude</label><input className="obsv-editor__input" value={str("latitude")} onChange={e => set({ latitude: numOrNull(e.target.value) })} placeholder="40.715" /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Longitude</label><input className="obsv-editor__input" value={str("longitude")} onChange={e => set({ longitude: numOrNull(e.target.value) })} placeholder="-73.965" /></div>

      <div className="obsv-editor__field"><label className="obsv-editor__label">Width (ft)</label><input className="obsv-editor__input" type="number" step="0.1" value={str("width_ft")} onChange={e => set({ width_ft: numOrNull(e.target.value) })} /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Height (ft)</label><input className="obsv-editor__input" type="number" step="0.1" value={str("height_ft")} onChange={e => set({ height_ft: numOrNull(e.target.value) })} /></div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Indoor?</label>
        <select className="obsv-editor__input" value={form.indoor == null ? "" : form.indoor ? "true" : "false"} onChange={e => set({ indoor: e.target.value === "" ? null : e.target.value === "true" })}>
          <option value="">—</option>
          <option value="true">Indoor</option>
          <option value="false">Outdoor</option>
        </select>
      </div>

      <div className="obsv-editor__field"><label className="obsv-editor__label">Completion Date</label><input className="obsv-editor__input" type="date" value={str("completion_date")} onChange={e => set({ completion_date: e.target.value || null })} /></div>
      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Wall Status</label>
        <select className="obsv-editor__input" value={str("wall_status") || "active"} onChange={e => set({ wall_status: e.target.value })}>
          <option value="active">Active</option>
          <option value="painted_over">Painted Over</option>
          <option value="damaged">Damaged</option>
          <option value="temporary">Temporary</option>
        </select>
      </div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Viewable Hours</label><input className="obsv-editor__input" value={str("viewable_hours")} onChange={e => set({ viewable_hours: e.target.value || null })} placeholder="e.g. During Wake Coffee hours; 24/7 public" /></div>
      <div className="obsv-editor__field"><label className="obsv-editor__label">Commissioned By</label><input className="obsv-editor__input" value={str("commissioned_by")} onChange={e => set({ commissioned_by: e.target.value || null })} /></div>

      <div className="obsv-editor__field">
        <label className="obsv-editor__label">Public Topics (comma-separated — e.g. Brooklyn, Fashion District, loft culture)</label>
        <input
          className="obsv-editor__input"
          value={topics.join(", ")}
          onChange={e => set({ public_topics: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
        />
      </div>

      <button type="button" className="admin-btn admin-btn--primary" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save Mural Details"}
      </button>
    </div>
  );
}
