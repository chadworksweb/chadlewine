"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Era = {
  id: string;
  slug: string;
  title: string;
  kind: "life" | "release";
  date_start: string | null;
  date_end: string | null;
  release_id: string | null;
  status: "draft" | "published";
};

type LifeEvent = {
  id: string;
  slug: string;
  title: string;
  date_start: string | null;
  date_end: string | null;
  era_id: string | null;
  source: "documentary" | "captured";
  status: "draft" | "published";
  body_md: string;
};

type Tab = "eras" | "life_events" | "music";
type Toast = { kind: "ok" | "err"; message: string } | null;

export default function ArcNodesPage() {
  const [tab, setTab] = useState<Tab>("eras");
  const [eras, setEras] = useState<Era[]>([]);
  const [lifeEvents, setLifeEvents] = useState<LifeEvent[]>([]);
  const [erasFilter, setErasFilter] = useState<"all" | "life" | "release">("all");
  const [eventsFilter, setEventsFilter] = useState<"all" | "captured" | "documentary">("all");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>(null);

  async function loadAll() {
    setLoading(true);
    const [eR, lR] = await Promise.all([
      fetch("/api/admin/arc/eras-list").then((r) => r.json()),
      fetch("/api/admin/arc/life-events-list").then((r) => r.json()),
    ]);
    setEras(Array.isArray(eR) ? eR : []);
    setLifeEvents(Array.isArray(lR) ? lR : []);
    setLoading(false);
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- client-side data load on mount
  useEffect(() => { loadAll(); }, []);

  function flash(kind: Toast extends infer T ? (T extends { kind: infer K } ? K : never) : never, message: string) {
    setToast({ kind, message });
    setTimeout(() => setToast(null), 3500);
  }

  const filteredEras = useMemo(() => (
    erasFilter === "all" ? eras : eras.filter((e) => e.kind === erasFilter)
  ), [eras, erasFilter]);

  const filteredEvents = useMemo(() => (
    eventsFilter === "all" ? lifeEvents : lifeEvents.filter((e) => e.source === eventsFilter)
  ), [lifeEvents, eventsFilter]);

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Arc Nodes</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/admin/arc/capture" className="admin-btn admin-btn--secondary">+ Capture</Link>
          <Link href="/admin/arc" className="admin-btn admin-btn--secondary">← Arc</Link>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: "var(--space-md)", borderBottom: "1px solid var(--border-subtle)" }}>
        <TabBtn active={tab === "eras"} onClick={() => setTab("eras")}>Eras ({eras.length})</TabBtn>
        <TabBtn active={tab === "life_events"} onClick={() => setTab("life_events")}>Life Events ({lifeEvents.length})</TabBtn>
        <TabBtn active={tab === "music"} onClick={() => setTab("music")}>Music</TabBtn>
      </div>

      {toast && (
        <div style={{
          marginBottom: "var(--space-md)",
          padding: "var(--space-sm) var(--space-md)",
          border: `1px solid ${toast.kind === "ok" ? "#33cc55" : "#ff3333"}`,
          color: toast.kind === "ok" ? "#33cc55" : "#ff3333",
          borderRadius: 4,
          fontFamily: "var(--font-ui)",
          fontSize: "0.85rem",
        }}>{toast.message}</div>
      )}

      {loading && <p style={{ color: "var(--text-tertiary)" }}>Loading…</p>}

      {tab === "eras" && !loading && (
        <>
          <FilterRow>
            <FilterBtn active={erasFilter === "all"} onClick={() => setErasFilter("all")}>All</FilterBtn>
            <FilterBtn active={erasFilter === "life"} onClick={() => setErasFilter("life")}>Life</FilterBtn>
            <FilterBtn active={erasFilter === "release"} onClick={() => setErasFilter("release")}>Release</FilterBtn>
          </FilterRow>
          <div className="arc-node-list">
            {filteredEras.map((era) => (
              <EraRow
                key={era.id}
                era={era}
                onSaved={(updated) => {
                  setEras((rows) => rows.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
                  flash("ok", `Saved "${updated.title}".`);
                }}
                onDeleted={() => {
                  setEras((rows) => rows.filter((r) => r.id !== era.id));
                  flash("ok", `Deleted "${era.title}".`);
                }}
                onError={(msg) => flash("err", msg)}
              />
            ))}
            {filteredEras.length === 0 && <p style={{ color: "var(--text-tertiary)" }}>No eras match this filter.</p>}
          </div>
        </>
      )}

      {tab === "life_events" && !loading && (
        <>
          <FilterRow>
            <FilterBtn active={eventsFilter === "all"} onClick={() => setEventsFilter("all")}>All</FilterBtn>
            <FilterBtn active={eventsFilter === "captured"} onClick={() => setEventsFilter("captured")}>Captured</FilterBtn>
            <FilterBtn active={eventsFilter === "documentary"} onClick={() => setEventsFilter("documentary")}>Documentary (read-only)</FilterBtn>
          </FilterRow>
          <div className="arc-node-list">
            {filteredEvents.map((ev) => (
              <LifeEventRow
                key={ev.id}
                event={ev}
                eras={eras}
                onSaved={(updated) => {
                  setLifeEvents((rows) => rows.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
                  flash("ok", `Saved "${updated.title}".`);
                }}
                onDeleted={() => {
                  setLifeEvents((rows) => rows.filter((r) => r.id !== ev.id));
                  flash("ok", `Deleted "${ev.title}".`);
                }}
                onError={(msg) => flash("err", msg)}
              />
            ))}
            {filteredEvents.length === 0 && <p style={{ color: "var(--text-tertiary)" }}>No life events match this filter.</p>}
          </div>
        </>
      )}

      {tab === "music" && !loading && (
        <div style={{ maxWidth: 720, display: "grid", gap: "var(--space-sm)" }}>
          <p style={{ color: "var(--text-secondary)" }}>
            Songs and albums each have full admin pages with art, sections, lyrics, etc. Edit them there:
          </p>
          <Link href="/admin/music/songs" className="admin-btn admin-btn--primary">Songs admin →</Link>
          <Link href="/admin/music/releases" className="admin-btn admin-btn--primary">Releases admin →</Link>
        </div>
      )}
    </div>
  );
}

// ---------- Era row ----------

function EraRow({
  era, onSaved, onDeleted, onError,
}: {
  era: Era;
  onSaved: (e: Era) => void;
  onDeleted: () => void;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(era.title);
  const [kind, setKind] = useState<Era["kind"]>(era.kind);
  const [dateStart, setDateStart] = useState(era.date_start ?? "");
  const [dateEnd, setDateEnd] = useState(era.date_end ?? "");
  const [status, setStatus] = useState<Era["status"]>(era.status);
  const [saving, setSaving] = useState(false);
  const isRelease = era.kind === "release";

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/arc/eras/${era.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          kind,
          date_start: dateStart || null,
          date_end: dateEnd || null,
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onSaved(data.row);
      setOpen(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (!confirm(`Delete era "${era.title}"? This cannot be undone.`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/arc/eras/${era.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onDeleted();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`arc-node-row arc-node-row--${era.kind}${open ? " is-open" : ""}`}>
      <button type="button" className="arc-node-row__head" onClick={() => setOpen((v) => !v)}>
        <span className={`arc-node-row__pill arc-node-row__pill--${era.kind}`}>{era.kind}</span>
        <span className="arc-node-row__title">{era.title}</span>
        <span className="arc-node-row__dates">
          {era.date_start ?? "?"}{era.date_end ? ` → ${era.date_end}` : ""}
        </span>
        <span className={`arc-node-row__status arc-node-row__status--${era.status}`}>{era.status}</span>
        <span className="arc-node-row__chev">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="arc-node-row__body">
          {isRelease && (
            <p style={{ fontSize: "0.8rem", color: "var(--text-tertiary)", marginBottom: 8 }}>
              Release eras mirror the album record. Edit title, dates, and status on the album itself.
            </p>
          )}
          <Field label="Title">
            <input className="obsv-editor__input" value={title} onChange={(e) => setTitle(e.target.value)} disabled={isRelease} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <Field label="Kind">
              <select className="obsv-editor__input" value={kind} onChange={(e) => setKind(e.target.value as Era["kind"])} disabled={isRelease}>
                <option value="life">life</option>
                <option value="release">release</option>
              </select>
            </Field>
            <Field label="Date start">
              <input className="obsv-editor__input" type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} disabled={isRelease} />
            </Field>
            <Field label="Date end">
              <input className="obsv-editor__input" type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} disabled={isRelease} />
            </Field>
          </div>
          <Field label="Status">
            <select className="obsv-editor__input" value={status} onChange={(e) => setStatus(e.target.value as "draft" | "published")} disabled={isRelease}>
              <option value="draft">draft</option>
              <option value="published">published</option>
            </select>
          </Field>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {isRelease ? (
              era.release_id ? (
                <Link href={`/admin/music/releases/${era.release_id}`} className="admin-btn admin-btn--primary">
                  Open album →
                </Link>
              ) : (
                <span style={{ fontSize: "0.8rem", color: "var(--text-tertiary)" }}>
                  Not linked to an album record yet.
                </span>
              )
            ) : (
              <>
                <button onClick={save} disabled={saving} className="admin-btn admin-btn--primary">
                  {saving ? "Saving…" : "Save"}
                </button>
                <button onClick={del} disabled={saving} className="admin-btn admin-btn--danger">Delete</button>
              </>
            )}
            <button onClick={() => setOpen(false)} disabled={saving} className="admin-btn admin-btn--secondary">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Life event row ----------

function LifeEventRow({
  event, eras, onSaved, onDeleted, onError,
}: {
  event: LifeEvent;
  eras: Era[];
  onSaved: (ev: LifeEvent) => void;
  onDeleted: () => void;
  onError: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [dateStart, setDateStart] = useState(event.date_start ?? "");
  const [dateEnd, setDateEnd] = useState(event.date_end ?? "");
  const [eraId, setEraId] = useState(event.era_id ?? "");
  const [status, setStatus] = useState(event.status);
  const [bodyMd, setBodyMd] = useState(event.body_md ?? "");
  const [saving, setSaving] = useState(false);
  const fromDocumentary = event.source === "documentary";

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/arc/life-events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          date_start: dateStart || null,
          date_end: dateEnd || null,
          era_id: eraId || null,
          status,
          body_md: bodyMd,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onSaved(data.row);
      setOpen(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (!confirm(`Delete life event "${event.title}"?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/arc/life-events/${event.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onDeleted();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`arc-node-row arc-node-row--event${open ? " is-open" : ""}`}>
      <button type="button" className="arc-node-row__head" onClick={() => setOpen((v) => !v)}>
        <span className={`arc-node-row__pill arc-node-row__pill--${event.source}`}>{event.source}</span>
        <span className="arc-node-row__title">{event.title}</span>
        <span className="arc-node-row__dates">
          {event.date_start ?? "?"}{event.date_end ? ` → ${event.date_end}` : ""}
        </span>
        <span className={`arc-node-row__status arc-node-row__status--${event.status}`}>{event.status}</span>
        <span className="arc-node-row__chev">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="arc-node-row__body">
          {fromDocumentary && (
            <p style={{ fontSize: "0.8rem", color: "var(--text-tertiary)", marginBottom: 8 }}>
              Imported verbatim from the documentary. Saving an edit marks this node as captured,
              so a future ingest re-run won&apos;t overwrite your changes.
            </p>
          )}
          <Field label="Title">
            <input className="obsv-editor__input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <Field label="Date start">
              <input className="obsv-editor__input" type="date" value={dateStart} onChange={(e) => setDateStart(e.target.value)} />
            </Field>
            <Field label="Date end">
              <input className="obsv-editor__input" type="date" value={dateEnd} onChange={(e) => setDateEnd(e.target.value)} />
            </Field>
            <Field label="Era">
              <select className="obsv-editor__input" value={eraId} onChange={(e) => setEraId(e.target.value)}>
                <option value="">— none —</option>
                {eras.map((e) => (
                  <option key={e.id} value={e.id}>{e.kind === "life" ? "L" : "R"} · {e.title}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Status">
            <select className="obsv-editor__input" value={status} onChange={(e) => setStatus(e.target.value as "draft" | "published")}>
              <option value="draft">draft</option>
              <option value="published">published</option>
            </select>
          </Field>
          <Field label="Body (markdown)">
            <textarea className="obsv-editor__input" rows={6} value={bodyMd} onChange={(e) => setBodyMd(e.target.value)} />
          </Field>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button onClick={save} disabled={saving} className="admin-btn admin-btn--primary">
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={del} disabled={saving} className="admin-btn admin-btn--danger">Delete</button>
            <button onClick={() => setOpen(false)} disabled={saving} className="admin-btn admin-btn--secondary">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Bits ----------

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 16px",
        background: "transparent",
        border: "none",
        borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
        color: active ? "var(--text-primary)" : "var(--text-tertiary)",
        fontFamily: "var(--font-ui)",
        fontSize: "0.9rem",
        cursor: "pointer",
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  );
}

function FilterRow({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 6, marginBottom: "var(--space-sm)" }}>{children}</div>;
}

function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "4px 12px",
        background: active ? "var(--accent)" : "transparent",
        color: active ? "#fff" : "var(--text-secondary)",
        border: "1px solid var(--border-subtle)",
        borderRadius: 4,
        fontFamily: "var(--font-ui)",
        fontSize: "0.78rem",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block" }}>
      <div style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)", marginBottom: 4, fontFamily: "var(--font-ui)" }}>
        {label}
      </div>
      {children}
    </label>
  );
}
