"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useAutosave } from "@/hooks/useAutosave";
import { SeoFieldsPanel } from "@/components/SeoFieldsPanel";

interface EventRecord {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published";
  summary: string | null;
  body: string | null;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
  venue_name: string | null;
  venue_address: string | null;
  venue_city: string | null;
  venue_state: string | null;
  venue_url: string | null;
  hero_image_path: string | null;
  rsvp_enabled: boolean;
  capacity: number | null;
  checkin_enabled: boolean;
  checkin_token: string;
  seo_title: string | null;
  seo_description: string | null;
  og_image_path: string | null;
  sort_order: number;
}

interface Rsvp {
  id: string;
  name: string;
  email: string;
  party_size: number;
  note: string | null;
  created_at: string;
}

interface Checkin {
  id: string;
  name: string | null;
  email: string;
  rsvp_id: string | null;
  created_at: string;
}

// timestamptz <-> <input type="datetime-local"> (naive local wall time).
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EditEventPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const [ev, setEv] = useState<EventRecord | null>(null);
  const [rsvps, setRsvps] = useState<Rsvp[]>([]);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [qrBust, setQrBust] = useState(0);

  useEffect(() => {
    fetch(`/api/admin/events/${id}`)
      .then((r) => r.json())
      .then((d) => { if (d?.event) setEv(d.event); });
    fetch(`/api/admin/events/${id}/rsvps`).then((r) => r.json()).then((d) => setRsvps(Array.isArray(d) ? d : []));
    fetch(`/api/admin/events/${id}/checkins`).then((r) => r.json()).then((d) => setCheckins(Array.isArray(d) ? d : []));
  }, [id]);

  const set = useCallback(<K extends keyof EventRecord>(field: K, value: EventRecord[K]) => {
    setEv((prev) => (prev ? { ...prev, [field]: value } : prev));
  }, []);

  const buildPayload = useCallback(
    (d: EventRecord) => ({
      slug: d.slug,
      title: d.title,
      status: d.status,
      summary: d.summary,
      body: d.body,
      starts_at: d.starts_at,
      ends_at: d.ends_at,
      timezone: d.timezone,
      venue_name: d.venue_name,
      venue_address: d.venue_address,
      venue_city: d.venue_city,
      venue_state: d.venue_state,
      venue_url: d.venue_url,
      hero_image_path: d.hero_image_path,
      rsvp_enabled: d.rsvp_enabled,
      capacity: d.capacity,
      checkin_enabled: d.checkin_enabled,
      seo_title: d.seo_title,
      seo_description: d.seo_description,
      og_image_path: d.og_image_path,
      sort_order: d.sort_order,
    }),
    [],
  );

  const { status: autosaveStatus } = useAutosave({
    data: ev || ({} as EventRecord),
    endpoint: "/api/admin/events",
    id,
    buildPayload,
    enabled: !!ev && !!ev.title,
  });

  async function handleDelete() {
    if (!confirm("Delete this event and all its RSVPs + check-ins?")) return;
    await fetch(`/api/admin/events/${id}`, { method: "DELETE" });
    router.push("/admin/events");
  }

  async function regenToken() {
    if (!confirm("Regenerate the venue QR? Any already-printed code stops working.")) return;
    const res = await fetch(`/api/admin/events/${id}/checkin-token`, { method: "POST" });
    if (res.ok) {
      const d = await res.json();
      set("checkin_token", d.checkin_token);
      setQrBust((n) => n + 1);
    }
  }

  if (!ev) {
    return (
      <div className="admin-page">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="obsv-editor">
      <div className="obsv-editor__header">
        <h1 className="admin-page__title">Edit Event</h1>
        <div className="obsv-editor__actions">
          <Link href="/admin/events" className="admin-btn admin-btn--secondary">All Events</Link>
          {ev.status === "published" && (
            <Link href={`/irl/${ev.slug}`} className="admin-btn admin-btn--secondary" target="_blank">View</Link>
          )}
          <button className="admin-btn admin-btn--danger" onClick={handleDelete} type="button">Delete</button>
          <span className={`autosave-status autosave-status--${autosaveStatus}`}>
            {autosaveStatus === "saving" && "Saving..."}
            {autosaveStatus === "saved" && "Saved"}
            {autosaveStatus === "error" && "Save failed"}
          </span>
        </div>
      </div>

      <div className="obsv-editor__grid">
        {/* Main column */}
        <div className="obsv-editor__main">
          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="title">Title</label>
            <input id="title" className="obsv-editor__input" type="text" value={ev.title}
              onChange={(e) => set("title", e.target.value)} />
          </div>

          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="slug">Slug</label>
            <input id="slug" className="obsv-editor__input obsv-editor__input--mono" type="text" value={ev.slug}
              onChange={(e) => set("slug", e.target.value)} />
            <span className="obsv-editor__hint" style={{ fontSize: "0.72rem", color: "var(--text-tertiary)" }}>
              Lives at /irl/{ev.slug || "..."}
            </span>
          </div>

          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="summary">Summary (listing card)</label>
            <textarea id="summary" className="obsv-editor__input" rows={2} value={ev.summary || ""}
              onChange={(e) => set("summary", e.target.value || null)} />
          </div>

          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="body">Details (markdown)</label>
            <textarea id="body" className="obsv-editor__input" rows={10} value={ev.body || ""}
              onChange={(e) => set("body", e.target.value || null)} />
          </div>

          <div className="obsv-editor__field">
            <label className="obsv-editor__label" htmlFor="hero">Hero image path</label>
            <input id="hero" className="obsv-editor__input obsv-editor__input--mono" type="text"
              value={ev.hero_image_path || ""} placeholder="/uploads/events/..."
              onChange={(e) => set("hero_image_path", e.target.value || null)} />
          </div>

          {/* Search Appearance */}
          <div style={{ marginTop: "1.5rem" }}>
            <SeoFieldsPanel
              seoTitle={ev.seo_title || ""}
              seoDescription={ev.seo_description || ""}
              defaultTitle={`${ev.title || "Untitled Event"} - Chad Lewine`}
              defaultDescription={ev.summary || ""}
              descriptionFallbackHint="the event summary"
              urlBreadcrumb={`irl > ${ev.slug}`}
              onChange={(field, value) => set(field, (value || null) as EventRecord[typeof field])}
            />
          </div>
        </div>

        {/* Sidebar */}
        <div className="obsv-editor__sidebar">
          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Publish</h3>
            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="status">Status</label>
              <select id="status" className="obsv-editor__input" value={ev.status}
                onChange={(e) => set("status", e.target.value as EventRecord["status"])}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="sort_order">Sort order</label>
              <input id="sort_order" className="obsv-editor__input" type="number" value={ev.sort_order}
                onChange={(e) => set("sort_order", Number(e.target.value) || 0)} />
            </div>
          </div>

          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">When</h3>
            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="starts_at">Starts</label>
              <input id="starts_at" className="obsv-editor__input" type="datetime-local"
                value={toLocalInput(ev.starts_at)}
                onChange={(e) => set("starts_at", e.target.value || null)} />
            </div>
            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="ends_at">Ends</label>
              <input id="ends_at" className="obsv-editor__input" type="datetime-local"
                value={toLocalInput(ev.ends_at)}
                onChange={(e) => set("ends_at", e.target.value || null)} />
            </div>
            <div className="obsv-editor__field">
              <label className="obsv-editor__label" htmlFor="timezone">Timezone</label>
              <input id="timezone" className="obsv-editor__input obsv-editor__input--mono" type="text"
                value={ev.timezone} onChange={(e) => set("timezone", e.target.value)} />
            </div>
          </div>

          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Venue</h3>
            <div className="obsv-editor__field">
              <input className="obsv-editor__input" type="text" placeholder="Venue name"
                value={ev.venue_name || ""} onChange={(e) => set("venue_name", e.target.value || null)} />
            </div>
            <div className="obsv-editor__field">
              <input className="obsv-editor__input" type="text" placeholder="Street address"
                value={ev.venue_address || ""} onChange={(e) => set("venue_address", e.target.value || null)} />
            </div>
            <div className="obsv-editor__field" style={{ display: "flex", gap: "0.4rem" }}>
              <input className="obsv-editor__input" type="text" placeholder="City"
                value={ev.venue_city || ""} onChange={(e) => set("venue_city", e.target.value || null)} />
              <input className="obsv-editor__input" type="text" placeholder="State" style={{ width: "6rem" }}
                value={ev.venue_state || ""} onChange={(e) => set("venue_state", e.target.value || null)} />
            </div>
            <div className="obsv-editor__field">
              <input className="obsv-editor__input" type="text" placeholder="Venue URL"
                value={ev.venue_url || ""} onChange={(e) => set("venue_url", e.target.value || null)} />
            </div>
          </div>

          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">RSVP</h3>
            <label className="obsv-editor__label" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input type="checkbox" checked={ev.rsvp_enabled}
                onChange={(e) => set("rsvp_enabled", e.target.checked)} />
              <span>Accept RSVPs</span>
            </label>
            <div className="obsv-editor__field" style={{ marginTop: "0.5rem" }}>
              <label className="obsv-editor__label" htmlFor="capacity">Capacity (optional)</label>
              <input id="capacity" className="obsv-editor__input" type="number" min={0}
                value={ev.capacity ?? ""} onChange={(e) => set("capacity", e.target.value === "" ? null : Number(e.target.value))} />
            </div>
          </div>

          {/* Venue QR / door check-in */}
          <div className="obsv-editor__panel">
            <h3 className="obsv-editor__panel-title">Venue QR &amp; Check-in</h3>
            <label className="obsv-editor__label" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input type="checkbox" checked={ev.checkin_enabled}
                onChange={(e) => set("checkin_enabled", e.target.checked)} />
              <span>Door open (accept check-ins)</span>
            </label>
            <div style={{ marginTop: "0.75rem", textAlign: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/admin/events/${id}/qr?v=${qrBust}`}
                alt="Venue check-in QR code"
                style={{ width: "100%", maxWidth: 240, border: "1px solid var(--border, #ddd)", borderRadius: 8 }}
              />
            </div>
            <p style={{ fontSize: "0.72rem", color: "var(--text-tertiary)", wordBreak: "break-all", marginTop: "0.5rem" }}>
              Print this at the door. It links to the check-in page for this event.
            </p>
            <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.5rem" }}>
              <a className="admin-btn admin-btn--secondary" href={`/api/admin/events/${id}/qr?v=${qrBust}`} download={`venue-qr-${ev.slug}.png`}>
                Download PNG
              </a>
              <button className="admin-btn admin-btn--secondary" type="button" onClick={regenToken}>
                Regenerate
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* RSVPs + check-ins */}
      <div style={{ marginTop: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h2 className="admin-page__title" style={{ fontSize: "1.1rem" }}>
            RSVPs <span style={{ color: "var(--text-tertiary)" }}>({rsvps.length})</span>
          </h2>
          {rsvps.length > 0 && (
            <a className="admin-btn admin-btn--secondary" href={`/api/admin/events/${id}/rsvps?format=csv`}>Export CSV</a>
          )}
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th className="admin-table__th">Name</th>
              <th className="admin-table__th">Email</th>
              <th className="admin-table__th">Party</th>
              <th className="admin-table__th">Checked in</th>
              <th className="admin-table__th">When</th>
            </tr>
          </thead>
          <tbody>
            {rsvps.map((r) => {
              const checkedIn = checkins.some((c) => c.rsvp_id === r.id || c.email.toLowerCase() === r.email.toLowerCase());
              return (
                <tr key={r.id} className="admin-table__row">
                  <td className="admin-table__td">{r.name}</td>
                  <td className="admin-table__td">{r.email}</td>
                  <td className="admin-table__td admin-table__td--date">{r.party_size}</td>
                  <td className="admin-table__td">{checkedIn ? "yes" : <span style={{ color: "#bbb" }}>—</span>}</td>
                  <td className="admin-table__td admin-table__td--date">
                    {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </td>
                </tr>
              );
            })}
            {rsvps.length === 0 && (
              <tr><td className="admin-table__td" colSpan={5} style={{ color: "#bbb" }}>No RSVPs yet.</td></tr>
            )}
          </tbody>
        </table>

        <h2 className="admin-page__title" style={{ fontSize: "1.1rem", marginTop: "1.5rem" }}>
          Checked in <span style={{ color: "var(--text-tertiary)" }}>
            ({checkins.length}{ev.capacity ? ` / ${ev.capacity}` : ""})
          </span>
        </h2>
        <table className="admin-table">
          <thead>
            <tr>
              <th className="admin-table__th">Name</th>
              <th className="admin-table__th">Email</th>
              <th className="admin-table__th">RSVP?</th>
              <th className="admin-table__th">When</th>
            </tr>
          </thead>
          <tbody>
            {checkins.map((c) => (
              <tr key={c.id} className="admin-table__row">
                <td className="admin-table__td">{c.name || <span style={{ color: "#bbb" }}>—</span>}</td>
                <td className="admin-table__td">{c.email}</td>
                <td className="admin-table__td">{c.rsvp_id ? "yes" : "walk-in"}</td>
                <td className="admin-table__td admin-table__td--date">
                  {new Date(c.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </td>
              </tr>
            ))}
            {checkins.length === 0 && (
              <tr><td className="admin-table__td" colSpan={4} style={{ color: "#bbb" }}>No check-ins yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
