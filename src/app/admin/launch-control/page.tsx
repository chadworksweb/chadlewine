"use client";

import { useEffect, useState } from "react";

interface Flag {
  section: string;
  is_live: boolean;
  updated_at: string;
}

export default function LaunchControlPage() {
  const [flags, setFlags] = useState<Flag[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/admin/feature-flags");
    if (res.ok) setFlags(await res.json());
    setLoading(false);
  }

  async function toggle(section: string, next: boolean) {
    setSaving(section);
    const res = await fetch("/api/admin/feature-flags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section, is_live: next }),
    });
    if (res.ok) {
      const updated = await res.json();
      setFlags((prev) =>
        prev.map((f) => (f.section === section ? updated : f))
      );
    }
    setSaving(null);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-side data load on mount
    load();
  }, []);

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Launch Control</h1>
      </div>

      <p className="admin-empty" style={{ marginBottom: "1.5rem" }}>
        Flip a section live on <strong>chadlewine.com</strong>. Off sections show
        the preview page. Staging always shows everything. Cache TTL: 30s on
        production.
      </p>

      {loading && <p className="admin-empty">Loading…</p>}

      {!loading && flags.length > 0 && (
        <div className="launch-control-list">
          {flags.map((f) => (
            <div key={f.section} className="launch-control-row">
              <div className="launch-control-row__info">
                <span className="launch-control-row__section">{f.section}</span>
                <span className="launch-control-row__meta">
                  {f.is_live ? "Live" : "Hidden"} · updated{" "}
                  {new Date(f.updated_at).toLocaleString()}
                </span>
              </div>
              <button
                className={`admin-btn ${
                  f.is_live ? "admin-btn--danger" : "admin-btn--primary"
                }`}
                disabled={saving === f.section}
                onClick={() => toggle(f.section, !f.is_live)}
              >
                {saving === f.section
                  ? "Saving…"
                  : f.is_live
                  ? "Take Offline"
                  : "Go Live"}
              </button>
            </div>
          ))}
        </div>
      )}

      <style jsx>{`
        .launch-control-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .launch-control-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.875rem 1rem;
          background: var(--glass-bg, rgba(255, 255, 255, 0.04));
          border: 1px solid var(--glass-border, rgba(255, 255, 255, 0.08));
          border-radius: 8px;
        }
        .launch-control-row__info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .launch-control-row__section {
          font-weight: 600;
          font-size: 1rem;
          text-transform: capitalize;
        }
        .launch-control-row__meta {
          font-size: 0.8rem;
          opacity: 0.7;
        }
      `}</style>
    </div>
  );
}
