"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/* Tripwire control panel.

   Reads as a board: the whole point is answering "is anything wrong" from
   across the room, then "what exactly" without a second click. Every check
   carries the reason it exists, because a check nobody understands is a check
   nobody trusts when it goes red at 2am. */

interface HistoryEntry {
  check_id: string;
  status: string;
  detail: string | null;
  duration_ms: number | null;
  created_at: string;
}

interface CheckView {
  id: string;
  label: string;
  because: string;
  status: "ok" | "fail" | "skip" | "unknown";
  detail: string | null;
  since: string | null;
  last_run_at: string | null;
  consecutive_failures: number;
  muted: boolean;
  history: HistoryEntry[];
}

interface PanelResponse {
  checks: CheckView[];
  summary: { total: number; failing: number; skipped: number; never_run: number };
}

const STATUS_COLOR: Record<string, string> = {
  ok: "#22c55e",
  fail: "#ef4444",
  skip: "#eab308",
  unknown: "#9ca3af",
};

const STATUS_WORD: Record<string, string> = {
  ok: "Holding",
  fail: "Tripped",
  skip: "Not judged",
  unknown: "Never run",
};

function relative(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function duration(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

export default function TripwireAdminPage() {
  const [data, setData] = useState<PanelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/tripwire", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as PanelResponse);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runNow(checkId?: string) {
    setRunning(checkId ?? "__all__");
    try {
      await fetch("/api/admin/tripwire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checkId ? { check_id: checkId } : {}),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(null);
    }
  }

  async function toggleMute(check: CheckView) {
    await fetch("/api/admin/tripwire", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ check_id: check.id, muted: !check.muted }),
    });
    await load();
  }

  const failing = data?.summary.failing ?? 0;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <div>
          <Link href="/admin/settings" className="admin-page__back-link">
            &larr; Settings
          </Link>
          <h1 className="admin-page__title">Tripwire</h1>
        </div>
        <button
          onClick={() => runNow()}
          disabled={running !== null}
          className="admin-btn admin-btn--primary"
        >
          {running === "__all__" ? "Running..." : "Run all now"}
        </button>
      </div>

      <p className="tripwire__intro">
        Each check asserts something that must stay true in production. These
        watch for wrong answers, not crashes, because the faults that hurt most
        here returned 200 and looked fine.
      </p>

      {error && <p className="tripwire__error">Failed to load: {error}</p>}

      {data && (
        <div className="admin-stats">
          <div className={`admin-stats__card${failing > 0 ? " admin-stats__card--warn" : ""}`}>
            <span className="admin-stats__value">{failing}</span>
            <span className="admin-stats__label">Tripped</span>
          </div>
          <div className="admin-stats__card">
            <span className="admin-stats__value">{data.summary.total}</span>
            <span className="admin-stats__label">Checks</span>
          </div>
          <div className="admin-stats__card">
            <span className="admin-stats__value">{data.summary.skipped}</span>
            <span className="admin-stats__label">Not judged</span>
          </div>
          <div className="admin-stats__card">
            <span className="admin-stats__value">{data.summary.never_run}</span>
            <span className="admin-stats__label">Never run</span>
          </div>
        </div>
      )}

      {loading && !data && <p className="tripwire__empty">Loading checks...</p>}

      <div className="tripwire__list">
        {data?.checks.map((check) => {
          const isOpen = expanded === check.id;
          return (
            <section
              key={check.id}
              className={`tripwire__check${check.status === "fail" && !check.muted ? " tripwire__check--tripped" : ""}`}
            >
              <div className="tripwire__check-head">
                <span
                  className="tripwire__dot"
                  style={{ background: STATUS_COLOR[check.status] }}
                  aria-hidden="true"
                />
                <div className="tripwire__check-title">
                  <h2 className="tripwire__check-label">
                    {check.label}
                    {check.muted && <span className="admin-badge admin-badge--muted">Muted</span>}
                  </h2>
                  <p className="tripwire__because">{check.because}</p>
                </div>
                <div className="tripwire__check-status">
                  <span
                    className="tripwire__status-word"
                    style={{ color: STATUS_COLOR[check.status] }}
                  >
                    {STATUS_WORD[check.status]}
                  </span>
                  <span className="tripwire__meta">
                    {check.status !== "unknown" && check.since
                      ? `for ${duration(check.since)} · checked ${relative(check.last_run_at)}`
                      : "no runs yet"}
                  </span>
                </div>
              </div>

              {check.detail && (
                <p className="tripwire__detail">{check.detail}</p>
              )}

              <div className="tripwire__actions">
                <button
                  onClick={() => runNow(check.id)}
                  disabled={running !== null}
                  className="admin-btn"
                >
                  {running === check.id ? "Running..." : "Run"}
                </button>
                <button onClick={() => toggleMute(check)} className="admin-btn">
                  {check.muted ? "Unmute" : "Mute"}
                </button>
                <button
                  onClick={() => setExpanded(isOpen ? null : check.id)}
                  className="admin-btn"
                >
                  {isOpen ? "Hide history" : `History (${check.history.length})`}
                </button>
              </div>

              {isOpen && (
                <table className="admin-table tripwire__history">
                  <thead>
                    <tr>
                      <th className="admin-table__th">When</th>
                      <th className="admin-table__th">Status</th>
                      <th className="admin-table__th">Detail</th>
                      <th className="admin-table__th">Took</th>
                    </tr>
                  </thead>
                  <tbody>
                    {check.history.length === 0 && (
                      <tr>
                        <td className="admin-table__td--empty" colSpan={4}>
                          No runs recorded yet
                        </td>
                      </tr>
                    )}
                    {check.history.map((h) => (
                      <tr key={`${h.check_id}-${h.created_at}`} className="admin-table__row">
                        <td>{relative(h.created_at)}</td>
                        <td style={{ color: STATUS_COLOR[h.status] }}>
                          {STATUS_WORD[h.status]}
                        </td>
                        <td>{h.detail}</td>
                        <td>{h.duration_ms != null ? `${h.duration_ms}ms` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
