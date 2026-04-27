"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Section = {
  id: string;
  slug: string;
  title: string;
  order_index: number;
  scope_kind: "era" | "date-range" | "thematic";
  era_id: string | null;
  date_start: string | null;
  date_end: string | null;
  status: "draft" | "published";
  is_stale: boolean;
  stale_reasons: { kind: string }[] | null;
  last_published_at: string | null;
  updated_at: string | null;
  dependency_count: number;
};

export default function SectionManagerPage() {
  const [rows, setRows] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/arc/sections")
      .then((r) => r.json())
      .then((d: Section[]) => { setRows(d); setLoading(false); });
  }, []);

  function fmtScope(s: Section): string {
    if (s.scope_kind === "thematic") return "thematic";
    if (s.scope_kind === "era") return "era";
    if (s.date_start && s.date_end) return `${s.date_start.slice(0, 4)}–${s.date_end.slice(0, 4)}`;
    if (s.date_start) return `${s.date_start.slice(0, 4)}–present`;
    return "—";
  }

  function fmtDate(s: string | null): string {
    if (!s) return "—";
    return new Date(s).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  if (loading) return <div className="admin-page"><p style={{ color: "var(--text-tertiary)" }}>Loading…</p></div>;

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Prose Sections</h1>
        <Link href="/admin/arc" className="admin-btn admin-btn--secondary">← Arc</Link>
      </div>

      <div className="admin-stats" style={{ marginBottom: "var(--space-xl)" }}>
        <div className="admin-stats__card"><span className="admin-stats__value">{rows.length}</span><span className="admin-stats__label">Total</span></div>
        <div className="admin-stats__card"><span className="admin-stats__value">{rows.filter((r) => r.status === "published").length}</span><span className="admin-stats__label">Published</span></div>
        <div className="admin-stats__card"><span className="admin-stats__value">{rows.filter((r) => r.is_stale).length}</span><span className="admin-stats__label">Stale</span></div>
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th className="admin-table__th">#</th>
            <th className="admin-table__th">Slug</th>
            <th className="admin-table__th">Scope</th>
            <th className="admin-table__th">Status</th>
            <th className="admin-table__th">Stale</th>
            <th className="admin-table__th">Deps</th>
            <th className="admin-table__th">Last Published</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id} className="admin-table__row">
              <td className="admin-table__td" style={{ color: "var(--text-tertiary)" }}>{s.order_index}</td>
              <td className="admin-table__td">
                <Link href={`/admin/arc/sections/${s.slug}`} className="admin-table__link">{s.slug}</Link>
              </td>
              <td className="admin-table__td">{fmtScope(s)}</td>
              <td className="admin-table__td"><span className={`admin-status admin-status--${s.status}`}>{s.status}</span></td>
              <td className="admin-table__td">
                {s.is_stale ? (
                  <span style={{ color: "#ffbb33", fontFamily: "var(--font-ui)", fontSize: "0.8rem" }}>
                    ● stale {s.stale_reasons?.length ? `(${s.stale_reasons.length})` : ""}
                  </span>
                ) : (
                  <span style={{ color: "var(--text-tertiary)" }}>—</span>
                )}
              </td>
              <td className="admin-table__td" style={{ textAlign: "right" }}>{s.dependency_count}</td>
              <td className="admin-table__td admin-table__td--date">{fmtDate(s.last_published_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
