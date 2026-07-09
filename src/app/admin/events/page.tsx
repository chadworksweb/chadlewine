"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface EventListItem {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published";
  starts_at: string | null;
  venue_name: string | null;
  venue_city: string | null;
  rsvp_count: number;
  checkin_count: number;
  checkin_enabled: boolean;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

export default function AdminEventsList() {
  const router = useRouter();
  const [rows, setRows] = useState<EventListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    fetch("/api/admin/events")
      .then((r) => r.json())
      .then((data) => {
        setRows(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(load, []);

  async function createEvent() {
    setCreating(true);
    try {
      const res = await fetch("/api/admin/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled Event", status: "draft" }),
      });
      const data = await res.json();
      if (res.ok && data?.id) {
        router.push(`/admin/events/${data.id}`);
      } else {
        alert(data?.error || "Could not create event");
        setCreating(false);
      }
    } catch {
      setCreating(false);
    }
  }

  async function toggleStatus(row: EventListItem) {
    setBusyId(row.id);
    const next = row.status === "published" ? "draft" : "published";
    try {
      const res = await fetch(`/api/admin/events/${row.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.ok) {
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: next } : r)));
      } else {
        const e = await res.json().catch(() => ({}));
        alert(e?.error || "Could not update status");
      }
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="admin-page">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Events</h1>
        <button className="admin-btn admin-btn--primary" onClick={createEvent} disabled={creating} type="button">
          {creating ? "Creating..." : "+ New Event"}
        </button>
      </div>
      <p style={{ color: "#666", marginTop: 0 }}>
        IRL events shown on <Link href="/irl" className="admin-table__link">/irl</Link>. Published events
        are live; drafts are hidden. Each event has a self-scan venue QR for door check-in.
      </p>

      <table className="admin-table">
        <thead>
          <tr>
            <th className="admin-table__th">Title</th>
            <th className="admin-table__th">When</th>
            <th className="admin-table__th">Venue</th>
            <th className="admin-table__th">RSVPs</th>
            <th className="admin-table__th">Checked in</th>
            <th className="admin-table__th">Door</th>
            <th className="admin-table__th">Status</th>
            <th className="admin-table__th"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="admin-table__row">
              <td className="admin-table__td">
                <Link href={`/admin/events/${row.id}`} className="admin-table__link">
                  {row.title}
                </Link>
              </td>
              <td className="admin-table__td admin-table__td--date">{formatWhen(row.starts_at)}</td>
              <td className="admin-table__td">
                {row.venue_name
                  ? `${row.venue_name}${row.venue_city ? `, ${row.venue_city}` : ""}`
                  : <span style={{ color: "#bbb" }}>—</span>}
              </td>
              <td className="admin-table__td admin-table__td--date">{row.rsvp_count || "—"}</td>
              <td className="admin-table__td admin-table__td--date">{row.checkin_count || "—"}</td>
              <td className="admin-table__td">
                {row.checkin_enabled
                  ? <span className="admin-badge" style={{ background: "var(--good, #22c55e)", color: "#fff" }}>open</span>
                  : <span style={{ color: "#bbb" }}>closed</span>}
              </td>
              <td className="admin-table__td">
                {row.status === "published" ? (
                  <span style={{ color: "var(--good, #22c55e)" }}>Published</span>
                ) : (
                  <span style={{ color: "#bbb" }}>Draft</span>
                )}
              </td>
              <td className="admin-table__td">
                <button
                  className="admin-btn admin-btn--secondary"
                  type="button"
                  disabled={busyId === row.id}
                  onClick={() => toggleStatus(row)}
                >
                  {busyId === row.id
                    ? "..."
                    : row.status === "published" ? "Unpublish" : "Publish"}
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td className="admin-table__td" colSpan={8} style={{ color: "#bbb" }}>
                No events yet. Create one to get started.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
