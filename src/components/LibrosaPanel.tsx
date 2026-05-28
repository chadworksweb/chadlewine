"use client";

import { useCallback, useEffect, useState } from "react";
import { ANALYZER_LEVERS, RENDER_LEVERS, mergeConfig, leversForProfile, type LibrosaProfile } from "@/lib/librosa-levers";
import { LibrosaLeverControls } from "@/components/LibrosaLeverControls";

interface StemHist { count: number; strong: number; medium: number; weak: number }
interface LibrosaData {
  slug: string;
  title: string;
  hasAudio: boolean;
  summary: {
    source: "stems" | "hpss" | "none";
    tempo_bpm: number | null;
    beatCount: number;
    stems: Record<string, StemHist>;
    envelope: { frames: number; hz: number | null } | null;
    pitch: { frames: number } | null;
  };
  beat_offset_seconds: number;
  profile: LibrosaProfile;
  hasStems: boolean;
  global: Record<string, number>;
  overrides: Record<string, number>;
  effective: Record<string, number>;
}

const SOURCE_LABEL: Record<string, string> = {
  stems: "Isolated stems",
  hpss: "HPSS (mixed master)",
  none: "Not analyzed",
};

export function LibrosaPanel({ songId }: { songId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<LibrosaData | null>(null);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [offsetMs, setOffsetMs] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(() => {
    if (!songId) return;
    fetch(`/api/admin/songs/${songId}/librosa`)
      .then((r) => r.json())
      .then((d: LibrosaData) => {
        if (d && !("error" in d)) {
          setData(d);
          setOverrides(d.overrides || {});
          setOffsetMs(Math.round((d.beat_offset_seconds || 0) * 1000));
        }
      })
      .catch(() => {});
  }, [songId]);

  // Lazy: only fetch the first time the panel is expanded, so opening a song
  // editor doesn't hit the analysis API for a panel the user isn't using.
  useEffect(() => { if (open && !data) load(); }, [open, data, load]);

  function onChange(id: string, value: number | null) {
    setSaved(false);
    setOverrides((prev) => {
      const next = { ...prev };
      if (value === null) delete next[id];
      else next[id] = value;
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    await fetch(`/api/admin/songs/${songId}/librosa`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overrides, beat_offset_seconds: offsetMs / 1000 }),
    });
    setSaving(false);
    setSaved(true);
  }

  const overrideCount = Object.keys(overrides).length;

  return (
    <div className="obsv-editor__panel">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", gap: "var(--space-sm)",
          width: "100%", background: "none", border: "none", padding: 0,
          cursor: "pointer", textAlign: "left",
        }}
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 150ms", color: "var(--text-secondary)", flex: "none" }}>
          <path d="M3 1 L7 5 L3 9" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        <span className="obsv-editor__panel-title" style={{ margin: 0 }}>Cube Visualizer (Librosa)</span>
        {overrideCount > 0 && <span className="admin-meta-chip">{overrideCount} override{overrideCount === 1 ? "" : "s"}</span>}
      </button>

      {open && !songId && (
        <p className="lev-row__desc">Save the song first to analyze and tune its cube.</p>
      )}
      {open && songId && !data && <p className="lev-row__desc">Loading...</p>}
      {open && songId && data && (
        <LibrosaPanelBody
          data={data}
          overrides={overrides}
          offsetMs={offsetMs}
          setOffsetMs={(v) => { setOffsetMs(v); setSaved(false); }}
          onChange={onChange}
          onSave={handleSave}
          saving={saving}
          saved={saved}
        />
      )}
    </div>
  );
}

function LibrosaPanelBody({
  data, overrides, offsetMs, setOffsetMs, onChange, onSave, saving, saved,
}: {
  data: LibrosaData;
  overrides: Record<string, number>;
  offsetMs: number;
  setOffsetMs: (v: number) => void;
  onChange: (id: string, value: number | null) => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  const baseline = mergeConfig(data.global, null);
  const values = mergeConfig(data.global, overrides);
  const explicit = new Set(Object.keys(overrides));
  const s = data.summary;
  const renderLevers = leversForProfile(RENDER_LEVERS, data.profile);
  const analyzerLevers = leversForProfile(ANALYZER_LEVERS, data.profile);
  const profileNote = "Stem-based cube. Overrides here apply to this song only and inherit the Stem profile defaults.";

  return (
    <div style={{ marginTop: "var(--space-md)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
        <button className="admin-btn admin-btn--primary" onClick={onSave} disabled={saving}>
          {saving ? "Saving..." : saved ? "Saved" : "Save tuning"}
        </button>
      </div>

      {/* Data readout */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-md)", margin: "var(--space-md) 0" }}>
        <Stat label="Source" value={SOURCE_LABEL[s.source]} />
        <Stat label="Tempo" value={s.tempo_bpm ? `${Math.round(s.tempo_bpm)} BPM` : "--"} />
        <Stat label="Beats" value={s.beatCount ? String(s.beatCount) : "--"} />
        {s.envelope && <Stat label="Envelope" value={`${s.envelope.frames} @ ${s.envelope.hz ?? "?"}Hz`} />}
        {s.pitch && <Stat label="Pitch" value={`${s.pitch.frames} frames`} />}
      </div>

      {Object.keys(s.stems).length > 0 && (
        <table className="admin-table" style={{ marginBottom: "var(--space-md)" }}>
          <thead>
            <tr>
              <th className="admin-table__th">Stem</th>
              <th className="admin-table__th">Hits</th>
              <th className="admin-table__th">Strong</th>
              <th className="admin-table__th">Medium</th>
              <th className="admin-table__th">Weak</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(s.stems).map(([name, h]) => (
              <tr key={name} className="admin-table__row">
                <td className="admin-table__td">{name}</td>
                <td className="admin-table__td">{h.count}</td>
                <td className="admin-table__td">{h.strong}</td>
                <td className="admin-table__td">{h.medium}</td>
                <td className="admin-table__td">{h.weak}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Beat offset */}
      <div className="lev-row">
        <div className="lev-row__head">
          <span className="lev-row__label">Beat offset</span>
        </div>
        <div className="lev-row__controls">
          <input
            type="range" className="lev-row__slider"
            min={-200} max={200} step={5}
            value={offsetMs}
            onChange={(e) => setOffsetMs(Number(e.target.value))}
          />
          <input
            type="number" className="lev-row__num"
            min={-1000} max={1000} step={5}
            value={offsetMs}
            onChange={(e) => setOffsetMs(Number(e.target.value) || 0)}
          />
          <span className="lev-row__unit">ms</span>
        </div>
        <p className="lev-row__desc">Nudge every event vs the published MP3. Positive = events fire later (stems lag the MP3).</p>
      </div>

      <p className="lev-row__desc" style={{ marginTop: "var(--space-md)" }}>{profileNote}</p>

      {/* Render overrides (live) */}
      <h4 className="obsv-editor__panel-title" style={{ marginTop: "var(--space-md)" }}>Render overrides</h4>
      <LibrosaLeverControls
        levers={renderLevers}
        values={values}
        mode="song"
        baseline={baseline}
        explicit={explicit}
        onChange={onChange}
      />

      {/* Analyzer overrides (re-scan) */}
      <h4 className="obsv-editor__panel-title" style={{ marginTop: "var(--space-lg)" }}>
        Analyzer overrides <span className="lev-row__rescan">(re-scan to apply)</span>
      </h4>
      <LibrosaLeverControls
        levers={analyzerLevers}
        values={values}
        mode="song"
        baseline={baseline}
        explicit={explicit}
        onChange={onChange}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: "var(--text-sm)", color: "var(--text-primary)", fontWeight: 500 }}>{value}</div>
    </div>
  );
}
