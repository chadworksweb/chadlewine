"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ANALYZER_LEVERS,
  RENDER_LEVERS,
  DEFAULT_CONFIG,
  leversForProfile,
  type LibrosaConfig,
  type LibrosaProfile,
} from "@/lib/librosa-levers";
import { LibrosaLeverControls } from "@/components/LibrosaLeverControls";

interface SongRow {
  slug: string;
  title: string;
  tempo_bpm: number | null;
  beat_offset_seconds: number;
  analyzed: boolean;
  hasStems: boolean;
  profile: LibrosaProfile;
  hasEnvelope: boolean;
  overrideCount: number;
}
interface Stats {
  withAudio: number;
  analyzed: number;
  withStems: number;
  withEnvelope: number;
  tempo: { count: number; min: number; max: number; avg: number };
}

// Stems are the only cubes with tunable reactions; frequency ("default")
// cubes render as rotation + ambient only, so this page tunes the stem
// profile exclusively.
const PROFILE: LibrosaProfile = "stem";

export default function LibrosaSettingsPage() {
  const [config, setConfig] = useState<LibrosaConfig | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/librosa-settings")
      .then((r) => r.json())
      .then((d) => {
        setConfig(d.configs?.[PROFILE] ?? null);
        setStats(d.stats);
        setSongs(d.songs || []);
      });
  }, []);

  const explicit = useMemo(() => {
    const set = new Set<string>();
    if (!config) return set;
    for (const [id, v] of Object.entries(config)) {
      if (v !== DEFAULT_CONFIG[id]) set.add(id);
    }
    return set;
  }, [config]);

  function onChange(id: string, value: number | null) {
    setSaved(false);
    setConfig((prev) => ({ ...(prev || DEFAULT_CONFIG), [id]: value ?? DEFAULT_CONFIG[id] }));
  }

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    setSaved(false);
    await fetch("/api/admin/librosa-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: PROFILE, config }),
    });
    setSaving(false);
    setSaved(true);
  }

  if (!config || !stats) return <div className="admin-page"><p>Loading...</p></div>;

  const renderLevers = leversForProfile(RENDER_LEVERS, PROFILE);
  const analyzerLevers = leversForProfile(ANALYZER_LEVERS, PROFILE);
  const stemSongs = songs.filter((s) => s.hasStems);

  const cards: { label: string; value: string; sub?: string }[] = [
    { label: "Stem cubes", value: String(stats.withStems), sub: "tunable" },
    { label: "Default cubes", value: String(stats.withAudio - stats.withStems), sub: "ambient only" },
    { label: "Bass envelope", value: String(stats.withEnvelope) },
    {
      label: "Tempo range",
      value: stats.tempo.count ? `${Math.round(stats.tempo.min)}-${Math.round(stats.tempo.max)}` : "--",
      sub: stats.tempo.count ? `avg ${stats.tempo.avg} BPM` : undefined,
    },
  ];

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Librosa — Stem Cubes</h1>
        <button className="admin-btn admin-btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : saved ? "Saved" : "Save stem defaults"}
        </button>
      </div>

      <p className="lev-row__desc" style={{ marginBottom: "var(--space-lg)" }}>
        Only stem-analyzed cubes have reactive effects. Frequency-only songs render as rotation + ambient
        and have nothing to tune. These defaults apply to every stem cube; each stem song can override per-song
        from its editor.
      </p>

      {/* Collective data view */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "var(--space-md)",
          marginBottom: "var(--space-xl)",
        }}
      >
        {cards.map((c) => (
          <div key={c.label} style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: 8, padding: "var(--space-md)" }}>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{c.label}</div>
            <div style={{ fontSize: "1.5rem", color: "var(--text-primary)", fontWeight: 600, marginTop: 4 }}>{c.value}</div>
            {c.sub && <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)" }}>{c.sub}</div>}
          </div>
        ))}
      </div>

      <div className="obsv-editor__panel">
        <h3 className="obsv-editor__panel-title">Render defaults (live)</h3>
        <LibrosaLeverControls levers={renderLevers} values={config} mode="global" baseline={DEFAULT_CONFIG} explicit={explicit} onChange={onChange} />
      </div>

      <div className="obsv-editor__panel">
        <h3 className="obsv-editor__panel-title">Analyzer defaults <span className="lev-row__rescan">(re-scan to apply)</span></h3>
        <LibrosaLeverControls levers={analyzerLevers} values={config} mode="global" baseline={DEFAULT_CONFIG} explicit={explicit} onChange={onChange} />
      </div>

      {/* Stem-song coverage table */}
      <div className="obsv-editor__panel">
        <h3 className="obsv-editor__panel-title">Stem cubes ({stemSongs.length})</h3>
        {stemSongs.length === 0 ? (
          <p className="lev-row__desc">No stem-analyzed songs yet. Run the stem analyzer (analyze_drums_stems.py) on a song to give it a tunable cube.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th className="admin-table__th">Title</th>
                <th className="admin-table__th">Tempo</th>
                <th className="admin-table__th">Envelope</th>
                <th className="admin-table__th">Offset</th>
                <th className="admin-table__th">Overrides</th>
              </tr>
            </thead>
            <tbody>
              {stemSongs.map((s) => (
                <tr key={s.slug} className="admin-table__row">
                  <td className="admin-table__td">
                    <Link href={`/admin/music/songs/${s.slug}`} className="admin-table__link">{s.title}</Link>
                  </td>
                  <td className="admin-table__td admin-table__td--date">{s.tempo_bpm ? `${Math.round(s.tempo_bpm)} BPM` : "--"}</td>
                  <td className="admin-table__td">{s.hasEnvelope ? "yes" : "--"}</td>
                  <td className="admin-table__td admin-table__td--date">{s.beat_offset_seconds ? `${(s.beat_offset_seconds * 1000).toFixed(0)} ms` : "0"}</td>
                  <td className="admin-table__td">{s.overrideCount > 0 ? <span className="admin-meta-chip">{s.overrideCount}</span> : "--"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
