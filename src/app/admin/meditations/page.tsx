"use client";

import Link from "next/link";
import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { formatDate } from "@/lib/utils";
import { useSearchParams } from "next/navigation";

type StatusTab = "all" | "published" | "draft";

const TAB_LABELS: Record<StatusTab, string> = {
  all: "All",
  published: "Published",
  draft: "Drafts",
};

interface MeditationRow {
  id: string;
  subtitle: string | null;
  body: string;
  plain_text: string;
  status: string;
  published_at: string | null;
  created_at: string;
  categories: string[];
  thoughtlines: string[];
  tags: string[];
}

interface MetaItem {
  id: string;
  title?: string;
  label?: string;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "...";
}

export default function AdminMeditationsPage() {
  return (
    <Suspense fallback={
      <div className="admin-page">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>Loading...</p>
      </div>
    }>
      <MeditationsContent />
    </Suspense>
  );
}

function MeditationsContent() {
  const searchParams = useSearchParams();
  const statusParam = searchParams.get("status");
  const activeTab: StatusTab =
    statusParam && statusParam in TAB_LABELS
      ? (statusParam as StatusTab)
      : "all";

  const [meditations, setMeditations] = useState<MeditationRow[]>([]);
  const [allCategories, setAllCategories] = useState<MetaItem[]>([]);
  const [allThoughtlines, setAllThoughtlines] = useState<MetaItem[]>([]);
  const [allTags, setAllTags] = useState<MetaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroUrl, setHeroUrl] = useState("");
  const [heroUploading, setHeroUploading] = useState(false);
  const heroInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    const [medsRes, catsRes, tlsRes, tagsRes] = await Promise.all([
      fetch("/api/admin/meditations"),
      fetch("/api/admin/categories"),
      fetch("/api/admin/thoughtlines"),
      fetch("/api/admin/tags"),
    ]);

    const meds = await medsRes.json();
    const cats = await catsRes.json();
    const tls = await tlsRes.json();
    const tags = await tagsRes.json();

    setMeditations(meds);
    setAllCategories(cats);
    setAllThoughtlines(tls);
    setAllTags(tags);
    setHeroUrl(`${process.env.NEXT_PUBLIC_BUNNY_PULL_ZONE_SITE_IMAGES}/page-heroes/meditations.webp`);
    setLoading(false);
  }, []);

  async function handleHeroUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "image/webp") {
      alert("Page hero must be a .webp file.");
      e.target.value = "";
      return;
    }
    setHeroUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("type", "site-image");
    fd.append("folder", "page-heroes");
    fd.append("filename", "meditations.webp");
    const res = await fetch("/api/admin/media/upload", { method: "POST", body: fd });
    if (res.ok) {
      const data = await res.json();
      setHeroUrl(data.url + "?t=" + Date.now());
    }
    setHeroUploading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- client-side data load on mount
    fetchData();
  }, [fetchData]);

  function getCategoryTitle(id: string) {
    return allCategories.find((c) => c.id === id)?.title || id;
  }

  function getThoughtlineTitle(id: string) {
    return allThoughtlines.find((t) => t.id === id)?.title || id;
  }

  function getTagLabel(id: string) {
    return allTags.find((t) => t.id === id)?.label || id;
  }

  if (loading) {
    return (
      <div className="admin-page">
        <p style={{ color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>
          Loading...
        </p>
      </div>
    );
  }

  const counts: Record<StatusTab, number> = {
    all: meditations.length,
    published: meditations.filter((m) => m.status === "published").length,
    draft: meditations.filter((m) => m.status === "draft").length,
  };

  const filtered =
    activeTab === "all"
      ? meditations
      : meditations.filter((m) => m.status === activeTab);

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1 className="admin-page__title">Meditations</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="/meditations" target="_blank" className="admin-btn">
            View Meditations
          </a>
          <Link href="/admin/meditations/new" className="admin-btn admin-btn--primary">
            New Meditation
          </Link>
        </div>
      </div>

      <div style={{ display: "flex", gap: "var(--space-md)", alignItems: "start" }}>
        <div className="admin-stats" style={{ flex: 1 }}>
          <div className="admin-stats__card">
            <span className="admin-stats__value">{counts.all}</span>
            <span className="admin-stats__label">Total</span>
          </div>
          <div className="admin-stats__card">
            <span className="admin-stats__value">{counts.published}</span>
            <span className="admin-stats__label">Published</span>
          </div>
          <div className="admin-stats__card">
            <span className="admin-stats__value">{counts.draft}</span>
            <span className="admin-stats__label">Drafts</span>
          </div>
        </div>

        {/* Cover Hero */}
        <div style={{ width: 160, flexShrink: 0 }}>
          <span className="obsv-editor__chip-label" style={{ marginBottom: 4, display: "block" }}>Cover Hero</span>
          {heroUrl ? (
            <img
              src={heroUrl}
              alt="Meditations hero"
              style={{ width: "100%", aspectRatio: "1200/630", objectFit: "cover", borderRadius: 4, cursor: "pointer" }}
              onClick={() => heroInputRef.current?.click()}
            />
          ) : (
            <button
              type="button"
              className="admin-btn admin-btn--small"
              onClick={() => heroInputRef.current?.click()}
              style={{ width: "100%" }}
            >
              Upload
            </button>
          )}
          <input
            ref={heroInputRef}
            type="file"
            accept="image/webp,image/png,image/jpeg"
            style={{ display: "none" }}
            onChange={handleHeroUpload}
          />
          {heroUploading && (
            <span style={{ fontSize: "0.7rem", color: "var(--text-tertiary)" }}>Uploading...</span>
          )}
        </div>
      </div>

      <div className="admin-tabs">
        {(Object.keys(TAB_LABELS) as StatusTab[]).map((tab) => (
          <Link
            key={tab}
            href={tab === "all" ? "/admin/meditations" : `/admin/meditations?status=${tab}`}
            className={`admin-tabs__tab${activeTab === tab ? " admin-tabs__tab--active" : ""}`}
          >
            {TAB_LABELS[tab]}
            <span className="admin-tabs__count">({counts[tab]})</span>
          </Link>
        ))}
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th className="admin-table__th" style={{ minWidth: 300 }}>Content</th>
            <th className="admin-table__th">Date</th>
            <th className="admin-table__th">Status</th>
            <th className="admin-table__th">Categories</th>
            <th className="admin-table__th">Thoughtlines</th>
            <th className="admin-table__th">Tags</th>
            <th className="admin-table__th">Words</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td className="admin-table__td admin-table__td--empty" colSpan={7}>
                No meditations found.
              </td>
            </tr>
          )}
          {filtered.map((med) => (
            <tr key={med.id} className="admin-table__row">
              <td className="admin-table__td">
                <Link
                  href={`/admin/meditations/${med.id}`}
                  className="admin-table__link"
                >
                  {truncate(med.plain_text, 100)}
                  {med.subtitle && (
                    <span style={{ display: "block", fontSize: "0.75rem", color: "var(--text-tertiary)", marginTop: 2 }}>
                      {med.subtitle}
                    </span>
                  )}
                </Link>
              </td>
              <td className="admin-table__td admin-table__td--date">
                {formatDate(med.published_at || med.created_at)}
              </td>
              <td className="admin-table__td">
                <span className={`admin-status admin-status--${med.status}`}>
                  {med.status}
                </span>
              </td>
              <td className="admin-table__td admin-table__td--meta">
                {med.categories.map((id) => (
                  <span key={id} className="admin-meta-chip">
                    {getCategoryTitle(id)}
                  </span>
                ))}
              </td>
              <td className="admin-table__td admin-table__td--meta">
                {med.thoughtlines.map((id) => (
                  <span key={id} className="admin-meta-chip">
                    {getThoughtlineTitle(id)}
                  </span>
                ))}
              </td>
              <td className="admin-table__td admin-table__td--meta">
                {med.tags.map((id) => (
                  <span key={id} className="admin-meta-chip">
                    {getTagLabel(id)}
                  </span>
                ))}
              </td>
              <td className="admin-table__td admin-table__td--indicator">
                {med.plain_text.trim().split(/\s+/).filter(Boolean).length}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
