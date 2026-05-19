"use client";

import Link from "next/link";
import { useState, useEffect, useCallback } from "react";
import { formatDate } from "@/lib/utils";

interface DoorPage {
  id: string;
  title: string;
  slug: string;
  body: string | null;
  status: string;
  target_queries: string[];
  funnel_targets: string[];
  meta_description: string | null;
  published_at: string | null;
  created_at: string;
}

export default function AdminDoorPagesPage() {
  const [pages, setPages] = useState<DoorPage[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/admin/door-pages");
    const data = await res.json();
    setPages(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-side data load on mount
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="admin-page">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p>
      </div>
    );
  }

  const published = pages.filter((p) => p.status === "published").length;
  const drafts = pages.filter((p) => p.status === "draft").length;
  const noQueries = pages.filter((p) => !p.target_queries || p.target_queries.length === 0).length;
  const noBody = pages.filter((p) => !p.body || p.body.trim().length === 0).length;
  const noFunnels = pages.filter((p) => !p.funnel_targets || p.funnel_targets.length === 0).length;
  const noMeta = pages.filter((p) => !p.meta_description).length;
  const totalQueries = pages.reduce((sum, p) => sum + (p.target_queries?.length || 0), 0);

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Door Pages</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/admin/door-pages/unmapped-hooks" className="admin-btn">
            Unmapped Hooks
          </Link>
          <Link href="/admin/door-pages/new" className="admin-btn admin-btn--primary">
            New Door Page
          </Link>
        </div>
      </div>

      <div className="admin-stats">
        <div className="admin-stats__card">
          <span className="admin-stats__value">{pages.length}</span>
          <span className="admin-stats__label">Total</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{published}</span>
          <span className="admin-stats__label">Published</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{drafts}</span>
          <span className="admin-stats__label">Drafts</span>
        </div>
        <div className="admin-stats__card">
          <span className="admin-stats__value">{totalQueries}</span>
          <span className="admin-stats__label">Total Queries</span>
        </div>
      </div>

      {/* Coverage gaps */}
      {pages.length > 0 && (noQueries > 0 || noBody > 0 || noFunnels > 0 || noMeta > 0) && (
        <div className="admin-stats" style={{ marginTop: 0 }}>
          {noQueries > 0 && (
            <div className="admin-stats__card admin-stats__card--warn">
              <span className="admin-stats__value">{noQueries}</span>
              <span className="admin-stats__label">No Queries</span>
            </div>
          )}
          {noBody > 0 && (
            <div className="admin-stats__card admin-stats__card--warn">
              <span className="admin-stats__value">{noBody}</span>
              <span className="admin-stats__label">No Body</span>
            </div>
          )}
          {noFunnels > 0 && (
            <div className="admin-stats__card admin-stats__card--warn">
              <span className="admin-stats__value">{noFunnels}</span>
              <span className="admin-stats__label">No Funnels</span>
            </div>
          )}
          {noMeta > 0 && (
            <div className="admin-stats__card admin-stats__card--warn">
              <span className="admin-stats__value">{noMeta}</span>
              <span className="admin-stats__label">No Meta Desc</span>
            </div>
          )}
        </div>
      )}

      <table className="admin-table">
        <thead>
          <tr>
            <th className="admin-table__th">Title</th>
            <th className="admin-table__th">Slug</th>
            <th className="admin-table__th">Status</th>
            <th className="admin-table__th">Target Queries</th>
            <th className="admin-table__th">Date</th>
          </tr>
        </thead>
        <tbody>
          {pages.length === 0 && (
            <tr>
              <td className="admin-table__td admin-table__td--empty" colSpan={5}>
                No door pages yet.
              </td>
            </tr>
          )}
          {pages.map((page) => (
            <tr key={page.id} className="admin-table__row">
              <td className="admin-table__td">
                <Link href={`/admin/door-pages/${page.slug || page.id}`} className="admin-table__link">
                  {page.title}
                </Link>
              </td>
              <td className="admin-table__td admin-table__td--date">/{page.slug}</td>
              <td className="admin-table__td">
                <span className={`admin-status admin-status--${page.status}`}>{page.status}</span>
              </td>
              <td className="admin-table__td admin-table__td--meta">
                {(page.target_queries || []).slice(0, 3).map((q, i) => (
                  <span key={i} className="admin-meta-chip">{q}</span>
                ))}
                {(page.target_queries || []).length > 3 && (
                  <span className="admin-meta-chip">+{page.target_queries.length - 3}</span>
                )}
              </td>
              <td className="admin-table__td admin-table__td--date">
                {formatDate(page.published_at || page.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
