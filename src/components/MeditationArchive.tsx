"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

interface MeditationItem {
  id: string;
  body: string;
  plain_text: string;
  published_at: string | null;
  created_at: string;
  categories: { title: string; slug: string }[];
  tags: { label: string; slug: string }[];
}

export function MeditationArchive({ meditations }: { meditations: MeditationItem[] }) {
  const [filterMonth, setFilterMonth] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterTag, setFilterTag] = useState<string | null>(null);

  // Build timeline months
  const months = useMemo(() => {
    const m = new Map<string, number>();
    meditations.forEach((med) => {
      const d = new Date(med.published_at || med.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      m.set(key, (m.get(key) || 0) + 1);
    });
    return Array.from(m.entries());
  }, [meditations]);

  // Build unique categories and tags
  const allCats = useMemo(() => {
    const cats = new Map<string, string>();
    meditations.forEach((m) => m.categories.forEach((c) => cats.set(c.slug, c.title)));
    return Array.from(cats.entries());
  }, [meditations]);

  const allTags = useMemo(() => {
    const tags = new Map<string, string>();
    meditations.forEach((m) => m.tags.forEach((t) => tags.set(t.slug, t.label)));
    return Array.from(tags.entries());
  }, [meditations]);

  // Filter
  const filtered = useMemo(() => {
    return meditations.filter((med) => {
      if (filterMonth) {
        const d = new Date(med.published_at || med.created_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (key !== filterMonth) return false;
      }
      if (filterCategory) {
        if (!med.categories.some((c) => c.slug === filterCategory)) return false;
      }
      if (filterTag) {
        if (!med.tags.some((t) => t.slug === filterTag)) return false;
      }
      return true;
    });
  }, [meditations, filterMonth, filterCategory, filterTag]);

  const hasFilters = filterMonth || filterCategory || filterTag;

  return (
    <div className="meditation-archive__layout">
      {/* Feed */}
      <div className="meditation-feed">
        {hasFilters && (
          <div style={{ marginBottom: "var(--space-md)", display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-xs)", color: "var(--reading-text-tertiary)" }}>
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </span>
            <button
              onClick={() => { setFilterMonth(null); setFilterCategory(null); setFilterTag(null); }}
              style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-xs)", color: "var(--text-accent)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
            >
              Clear filters
            </button>
          </div>
        )}
        {filtered.map((med) => (
          <Link key={med.id} href={`/meditations/${med.id}`} className="meditation-entry">
            <div className="meditation-entry__content">
              <time className="meditation-entry__date">
                {new Date(med.published_at || med.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                <span style={{ display: "inline-block", width: "2em" }} />
                {new Date(med.published_at || med.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })}
              </time>
              <div className="meditation-entry__body" dangerouslySetInnerHTML={{ __html: med.body }} />
              {(med.categories.length > 0 || med.tags.length > 0) && (
                <div className="meditation-entry__meta">
                  {med.categories.map((c) => (
                    <span key={c.slug} className="meditation-card__category">{c.title}</span>
                  ))}
                  {med.tags.map((t) => (
                    <span key={t.slug} className="meditation-card__tag">#{t.label}</span>
                  ))}
                </div>
              )}
            </div>
          </Link>
        ))}
        {filtered.length === 0 && (
          <p style={{ color: "var(--reading-text-tertiary)", fontFamily: "var(--font-ui)" }}>No meditations match filters.</p>
        )}
      </div>

      {/* Sidebar */}
      <aside className="meditation-sidebar">
        <div className="meditation-sidebar__section">
          <h3 className="meditation-sidebar__heading">Timeline</h3>
          <nav className="meditation-sidebar__timeline">
            {months.map(([key, count]) => {
              const [year, month] = key.split("-");
              const label = new Date(+year, +month - 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
              const isActive = filterMonth === key;
              return (
                <button
                  key={key}
                  className={`meditation-sidebar__month${isActive ? " meditation-sidebar__month--active" : ""}`}
                  onClick={() => setFilterMonth(isActive ? null : key)}
                >
                  {label} <span className="meditation-sidebar__count">{count}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {allCats.length > 0 && (
          <div className="meditation-sidebar__section">
            <h3 className="meditation-sidebar__heading">Categories</h3>
            <div className="meditation-sidebar__filters">
              {allCats.map(([slug, title]) => (
                <button
                  key={slug}
                  className={`meditation-sidebar__filter${filterCategory === slug ? " meditation-sidebar__filter--active" : ""}`}
                  onClick={() => setFilterCategory(filterCategory === slug ? null : slug)}
                >
                  {title}
                </button>
              ))}
            </div>
          </div>
        )}

        {allTags.length > 0 && (
          <div className="meditation-sidebar__section">
            <h3 className="meditation-sidebar__heading">Tags</h3>
            <div className="meditation-sidebar__filters">
              {allTags.map(([slug, label]) => (
                <button
                  key={slug}
                  className={`meditation-sidebar__filter${filterTag === slug ? " meditation-sidebar__filter--active" : ""}`}
                  onClick={() => setFilterTag(filterTag === slug ? null : slug)}
                >
                  #{label}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
