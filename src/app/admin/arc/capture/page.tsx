"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type EntityKind =
  | "life_event"
  | "era"
  | "song_state_change"
  | "relationship"
  | "geography_band"
  | "thematic_thread"
  | "industry_encounter"
  | "art_piece_date_update"
  | "prose_section_scope_update";

const KIND_LABELS: Record<EntityKind, string> = {
  life_event: "Life event",
  era: "Era (life or release)",
  song_state_change: "Song state change",
  relationship: "Relationship",
  geography_band: "Geography band",
  thematic_thread: "Thematic thread",
  industry_encounter: "Industry encounter",
  art_piece_date_update: "Art piece — set created_at_date",
  prose_section_scope_update: "Prose section — update scope",
};

const SONG_STATES = ["demo", "released", "unreleased", "reissued", "in-progress", "lost", "shelved"];

type Toast = { kind: "ok" | "err"; message: string; sectionsStale?: { id: string; slug: string }[] } | null;

type Era = { id: string; slug: string; title: string; kind: string };
type Song = { id: string; title: string; slug: string; song_state: string | null; release_date: string | null };
type Section = { id: string; slug: string; title: string };

export default function CaptureDrawerPage() {
  const [kind, setKind] = useState<EntityKind>("life_event");
  const [payload, setPayload] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  // Reference data
  const [eras, setEras] = useState<Era[]>([]);
  const [songs, setSongs] = useState<Song[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [sectionLookup, setSectionLookup] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/admin/arc/eras-list").then((r) => r.json()).then(setEras).catch(() => {});
    fetch("/api/admin/arc/songs-list").then((r) => r.json()).then(setSongs).catch(() => {});
    fetch("/api/admin/arc/sections")
      .then((r) => r.json())
      .then((rows: Section[]) => {
        setSections(rows);
        setSectionLookup(Object.fromEntries(rows.map((r) => [r.id, r.slug])));
      })
      .catch(() => {});
  }, []);

  function set(k: string, v: unknown) {
    setPayload((p) => ({ ...p, [k]: v }));
  }

  function reset() {
    setPayload({});
  }

  async function submit() {
    setSubmitting(true);
    setToast(null);
    try {
      const res = await fetch("/api/admin/arc/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_kind: kind, payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ kind: "err", message: data.error ?? `HTTP ${res.status}` });
      } else {
        const ids: string[] = data.sections_now_stale ?? [];
        const sectionsStale = ids.map((id) => ({ id, slug: sectionLookup[id] ?? id }));
        setToast({ kind: "ok", message: "Captured.", sectionsStale });
        reset();
      }
    } catch (e) {
      setToast({ kind: "err", message: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Capture</h1>
        <Link href="/admin/arc" className="admin-btn admin-btn--secondary">← Arc</Link>
      </div>

      <div style={{ maxWidth: 720, display: "grid", gap: "var(--space-md)" }}>
        <Field label="Entity kind">
          <select value={kind} onChange={(e) => { setKind(e.target.value as EntityKind); reset(); }} className="obsv-editor__input">
            {(Object.keys(KIND_LABELS) as EntityKind[]).map((k) => (
              <option key={k} value={k}>{KIND_LABELS[k]}</option>
            ))}
          </select>
        </Field>

        {kind === "life_event" && <LifeEventForm p={payload} set={set} eras={eras} />}
        {kind === "era" && <EraForm p={payload} set={set} />}
        {kind === "song_state_change" && <SongStateForm p={payload} set={set} songs={songs} />}
        {kind === "relationship" && <RelationshipForm p={payload} set={set} />}
        {kind === "geography_band" && <GeoBandForm p={payload} set={set} />}
        {kind === "thematic_thread" && <ThreadForm p={payload} set={set} />}
        {kind === "industry_encounter" && <IndustryForm p={payload} set={set} />}
        {kind === "art_piece_date_update" && <ArtDateForm p={payload} set={set} />}
        {kind === "prose_section_scope_update" && <ProseScopeForm p={payload} set={set} sections={sections} eras={eras} />}

        <div style={{ display: "flex", gap: 8, marginTop: "var(--space-md)" }}>
          <button onClick={submit} disabled={submitting} className="admin-btn admin-btn--primary">
            {submitting ? "Capturing…" : "Capture"}
          </button>
          <button onClick={reset} disabled={submitting} className="admin-btn admin-btn--secondary">Reset</button>
        </div>

        {toast && (
          <div style={{
            marginTop: "var(--space-md)",
            padding: "var(--space-md)",
            borderRadius: 6,
            border: `1px solid ${toast.kind === "ok" ? "#33cc55" : "#ff3333"}`,
            color: toast.kind === "ok" ? "#33cc55" : "#ff3333",
            background: "rgba(0,0,0,0.05)",
            fontFamily: "var(--font-ui)",
            fontSize: "0.9rem",
          }}>
            <div>{toast.message}</div>
            {toast.kind === "ok" && toast.sectionsStale && toast.sectionsStale.length > 0 && (
              <div style={{ marginTop: 8, color: "var(--text-secondary)" }}>
                Sections now stale ({toast.sectionsStale.length}):{" "}
                {toast.sectionsStale.map((s, i) => (
                  <span key={s.id}>
                    <Link href={`/admin/arc/sections/${s.slug}`} className="admin-table__link">{s.slug}</Link>
                    {i < toast.sectionsStale!.length - 1 ? ", " : ""}
                  </span>
                ))}
              </div>
            )}
            {toast.kind === "ok" && (!toast.sectionsStale || toast.sectionsStale.length === 0) && (
              <div style={{ marginTop: 4, color: "var(--text-tertiary)" }}>No prose sections affected.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Generic field wrapper ----------

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: "0.8rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", marginBottom: 4, fontFamily: "var(--font-ui)" }}>
        {label}
      </div>
      {children}
      {hint && <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: 4 }}>{hint}</div>}
    </label>
  );
}

// ---------- Per-kind forms ----------

type FormProps = { p: Record<string, unknown>; set: (k: string, v: unknown) => void };

function LifeEventForm({ p, set, eras }: FormProps & { eras: Era[] }) {
  return (
    <>
      <Field label="Title"><input className="obsv-editor__input" value={(p.title as string) ?? ""} onChange={(e) => set("title", e.target.value)} /></Field>
      <Field label="Slug (optional — auto from title)"><input className="obsv-editor__input" value={(p.slug as string) ?? ""} onChange={(e) => set("slug", e.target.value)} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <Field label="Date start"><input type="date" className="obsv-editor__input" value={(p.date_start as string) ?? ""} onChange={(e) => set("date_start", e.target.value)} /></Field>
        <Field label="Date end"><input type="date" className="obsv-editor__input" value={(p.date_end as string) ?? ""} onChange={(e) => set("date_end", e.target.value)} /></Field>
        <Field label="Precision">
          <select className="obsv-editor__input" value={(p.date_precision as string) ?? ""} onChange={(e) => set("date_precision", e.target.value || null)}>
            <option value="">—</option>
            <option value="year">year</option>
            <option value="month">month</option>
            <option value="day">day</option>
          </select>
        </Field>
      </div>
      <Field label="Era">
        <select className="obsv-editor__input" value={(p.era_id as string) ?? ""} onChange={(e) => set("era_id", e.target.value || null)}>
          <option value="">—</option>
          {eras.map((er) => <option key={er.id} value={er.id}>{er.kind}: {er.title}</option>)}
        </select>
      </Field>
      <Field label="Body (markdown)">
        <textarea className="obsv-editor__input" rows={6} value={(p.body_md as string) ?? ""} onChange={(e) => set("body_md", e.target.value)} />
      </Field>
      <StatusField p={p} set={set} />
    </>
  );
}

function EraForm({ p, set }: FormProps) {
  return (
    <>
      <Field label="Title"><input className="obsv-editor__input" value={(p.title as string) ?? ""} onChange={(e) => set("title", e.target.value)} /></Field>
      <Field label="Kind">
        <select className="obsv-editor__input" value={(p.kind as string) ?? "life"} onChange={(e) => set("kind", e.target.value)}>
          <option value="life">life</option>
          <option value="release">release</option>
        </select>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Field label="Date start"><input type="date" className="obsv-editor__input" value={(p.date_start as string) ?? ""} onChange={(e) => set("date_start", e.target.value)} /></Field>
        <Field label="Date end (optional)"><input type="date" className="obsv-editor__input" value={(p.date_end as string) ?? ""} onChange={(e) => set("date_end", e.target.value)} /></Field>
      </div>
      <Field label="Album ID (release kind only)"><input className="obsv-editor__input" value={(p.release_id as string) ?? ""} onChange={(e) => set("release_id", e.target.value || null)} /></Field>
      <Field label="Body (markdown)"><textarea className="obsv-editor__input" rows={4} value={(p.body_md as string) ?? ""} onChange={(e) => set("body_md", e.target.value)} /></Field>
      <StatusField p={p} set={set} />
    </>
  );
}

function SongStateForm({ p, set, songs }: FormProps & { songs: Song[] }) {
  return (
    <>
      <Field label="Song">
        <select className="obsv-editor__input" value={(p.song_id as string) ?? ""} onChange={(e) => set("song_id", e.target.value)}>
          <option value="">— pick a song —</option>
          {songs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}{s.song_state ? ` [${s.song_state}]` : ""}
            </option>
          ))}
        </select>
      </Field>
      <Field label="New state">
        <select className="obsv-editor__input" value={(p.new_state as string) ?? ""} onChange={(e) => set("new_state", e.target.value)}>
          <option value="">—</option>
          {SONG_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Field>
      <Field label="Note (optional)"><input className="obsv-editor__input" value={(p.note as string) ?? ""} onChange={(e) => set("note", e.target.value)} /></Field>
    </>
  );
}

function RelationshipForm({ p, set }: FormProps) {
  return (
    <>
      <Field label="Full name"><input className="obsv-editor__input" value={(p.full_name as string) ?? ""} onChange={(e) => set("full_name", e.target.value)} /></Field>
      <Field label="Role"><input className="obsv-editor__input" value={(p.role as string) ?? ""} onChange={(e) => set("role", e.target.value)} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Field label="First contact date"><input type="date" className="obsv-editor__input" value={(p.first_contact_date as string) ?? ""} onChange={(e) => set("first_contact_date", e.target.value)} /></Field>
        <Field label="Last contact date"><input type="date" className="obsv-editor__input" value={(p.last_contact_date as string) ?? ""} onChange={(e) => set("last_contact_date", e.target.value)} /></Field>
      </div>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontFamily: "var(--font-ui)", fontSize: "0.85rem" }}>
        <input type="checkbox" checked={(p.still_active as boolean) ?? true} onChange={(e) => set("still_active", e.target.checked)} />
        Still active
      </label>
      <Field label="Body (markdown)"><textarea className="obsv-editor__input" rows={4} value={(p.body_md as string) ?? ""} onChange={(e) => set("body_md", e.target.value)} /></Field>
      <StatusField p={p} set={set} />
    </>
  );
}

function GeoBandForm({ p, set }: FormProps) {
  return (
    <>
      <Field label="Location name"><input className="obsv-editor__input" value={(p.location_name as string) ?? ""} onChange={(e) => set("location_name", e.target.value)} /></Field>
      <Field label="Region (optional)"><input className="obsv-editor__input" value={(p.region as string) ?? ""} onChange={(e) => set("region", e.target.value)} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Field label="Date start"><input type="date" className="obsv-editor__input" value={(p.date_start as string) ?? ""} onChange={(e) => set("date_start", e.target.value)} /></Field>
        <Field label="Date end (optional)"><input type="date" className="obsv-editor__input" value={(p.date_end as string) ?? ""} onChange={(e) => set("date_end", e.target.value)} /></Field>
      </div>
      <Field label="Body (markdown)"><textarea className="obsv-editor__input" rows={4} value={(p.body_md as string) ?? ""} onChange={(e) => set("body_md", e.target.value)} /></Field>
      <StatusField p={p} set={set} />
    </>
  );
}

function ThreadForm({ p, set }: FormProps) {
  return (
    <>
      <Field label="Name"><input className="obsv-editor__input" value={(p.name as string) ?? ""} onChange={(e) => set("name", e.target.value)} /></Field>
      <Field label="Description (markdown)"><textarea className="obsv-editor__input" rows={4} value={(p.description_md as string) ?? ""} onChange={(e) => set("description_md", e.target.value)} /></Field>
      <StatusField p={p} set={set} />
    </>
  );
}

function IndustryForm({ p, set }: FormProps) {
  return (
    <>
      <Field label="Title"><input className="obsv-editor__input" value={(p.title as string) ?? ""} onChange={(e) => set("title", e.target.value)} /></Field>
      <Field label="Date"><input type="date" className="obsv-editor__input" value={(p.date as string) ?? ""} onChange={(e) => set("date", e.target.value)} /></Field>
      <Field label="Counterparty"><input className="obsv-editor__input" value={(p.counterparty as string) ?? ""} onChange={(e) => set("counterparty", e.target.value)} /></Field>
      <Field label="Outcome"><input className="obsv-editor__input" value={(p.outcome as string) ?? ""} onChange={(e) => set("outcome", e.target.value)} /></Field>
      <Field label="Body (markdown)"><textarea className="obsv-editor__input" rows={4} value={(p.body_md as string) ?? ""} onChange={(e) => set("body_md", e.target.value)} /></Field>
      <StatusField p={p} set={set} />
    </>
  );
}

function ArtDateForm({ p, set }: FormProps) {
  return (
    <>
      <Field label="Art piece ID" hint="Get from /admin/art for now."><input className="obsv-editor__input" value={(p.art_piece_id as string) ?? ""} onChange={(e) => set("art_piece_id", e.target.value)} /></Field>
      <Field label="Created at date"><input type="date" className="obsv-editor__input" value={(p.created_at_date as string) ?? ""} onChange={(e) => set("created_at_date", e.target.value)} /></Field>
    </>
  );
}

function ProseScopeForm({ p, set, sections, eras }: FormProps & { sections: Section[]; eras: Era[] }) {
  return (
    <>
      <Field label="Section">
        <select className="obsv-editor__input" value={(p.section_id as string) ?? ""} onChange={(e) => set("section_id", e.target.value)}>
          <option value="">— pick a section —</option>
          {sections.map((s) => <option key={s.id} value={s.id}>{s.slug}</option>)}
        </select>
      </Field>
      <Field label="Scope kind">
        <select className="obsv-editor__input" value={(p.scope_kind as string) ?? ""} onChange={(e) => set("scope_kind", e.target.value)}>
          <option value="">— unchanged —</option>
          <option value="era">era</option>
          <option value="date-range">date-range</option>
          <option value="thematic">thematic</option>
        </select>
      </Field>
      <Field label="Era (for scope_kind=era)">
        <select className="obsv-editor__input" value={(p.era_id as string) ?? ""} onChange={(e) => set("era_id", e.target.value || null)}>
          <option value="">— none —</option>
          {eras.map((er) => <option key={er.id} value={er.id}>{er.kind}: {er.title}</option>)}
        </select>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Field label="Date start"><input type="date" className="obsv-editor__input" value={(p.date_start as string) ?? ""} onChange={(e) => set("date_start", e.target.value)} /></Field>
        <Field label="Date end"><input type="date" className="obsv-editor__input" value={(p.date_end as string) ?? ""} onChange={(e) => set("date_end", e.target.value)} /></Field>
      </div>
    </>
  );
}

function StatusField({ p, set }: FormProps) {
  return (
    <Field label="Status">
      <select className="obsv-editor__input" value={(p.status as string) ?? "draft"} onChange={(e) => set("status", e.target.value)}>
        <option value="draft">draft</option>
        <option value="published">published</option>
      </select>
    </Field>
  );
}
