"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { PantheonStage, type PantheonVideo } from "./PantheonStage";
import { streamThumbnailUrl } from "@/lib/bunny-stream";

interface Category { id: string; title: string; slug: string; }

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoPantheon({
  categories,
  videos,
}: {
  categories: Category[];
  videos: PantheonVideo[];
}) {
  const catTitle = useMemo(() => {
    const m = new Map(categories.map((c) => [c.id, c.title]));
    return (id: string | null) => (id ? m.get(id) ?? null : null);
  }, [categories]);

  // Decorate rows with their category title for the plaque.
  const decorated = useMemo<PantheonVideo[]>(
    () => videos.map((v) => ({ ...v, categoryTitle: catTitle(v.category_id) })),
    [videos, catTitle],
  );

  // Default enshrined video: first featured, else first published.
  const initial = useMemo(
    () => decorated.find((v) => v.is_featured) ?? decorated[0] ?? null,
    [decorated],
  );

  const [activeId, setActiveId] = useState<string | null>(initial?.id ?? null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "az" | "za">("newest");
  const stageRef = useRef<HTMLDivElement | null>(null);

  // Deep link: ?v=slug on mount selects that video. One-time sync from the URL
  // (an external system) after mount -- SSR and first client render both use
  // `initial`, so there's no hydration mismatch, and the default page stays ISR.
  useEffect(() => {
    const slug = new URLSearchParams(window.location.search).get("v");
    if (!slug) return;
    const match = decorated.find((v) => v.slug === slug);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time URL sync on mount
    if (match) setActiveId(match.id);
  }, [decorated]);

  const active = decorated.find((v) => v.id === activeId) ?? initial;

  // Only offer categories that actually have a published video (decorated is
  // already published-only), so empty filters don't show.
  const shownCategories = useMemo(() => {
    const present = new Set(decorated.map((v) => v.category_id).filter(Boolean));
    return categories.filter((c) => present.has(c.id));
  }, [categories, decorated]);

  // Category filter + chosen sort applied to the grid.
  const visible = useMemo(() => {
    const list = activeCategory
      ? decorated.filter((v) => v.category_id === activeCategory)
      : decorated.slice();
    const ts = (v: PantheonVideo) => v.published_at || "";
    if (sortBy === "oldest") list.sort((a, b) => ts(a).localeCompare(ts(b)));
    else if (sortBy === "az") list.sort((a, b) => a.title.localeCompare(b.title));
    else if (sortBy === "za") list.sort((a, b) => b.title.localeCompare(a.title));
    else list.sort((a, b) => ts(b).localeCompare(ts(a))); // newest first (default)
    return list;
  }, [decorated, activeCategory, sortBy]);

  function enshrine(v: PantheonVideo) {
    setActiveId(v.id);
    const url = new URL(window.location.href);
    url.searchParams.set("v", v.slug);
    window.history.replaceState(null, "", url.toString());
    // Bring the stage into view -- the relic returns to the altar.
    stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function share(v: PantheonVideo) {
    const url = `${window.location.origin}/music-videos?v=${v.slug}`;
    if (navigator.share) {
      navigator.share({ title: v.title, url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url).catch(() => {});
    }
  }

  return (
    <div className="video-pantheon">
      <div className="video-pantheon__stage" ref={stageRef}>
        <PantheonStage video={active} onShare={share} />
      </div>

      {decorated.length > 1 && (
        <div className="video-pantheon__library">
          <h2 className="video-pantheon__library-title">The Collection</h2>
          <div className="video-pantheon__library-body">
            <aside className="video-pantheon__sidebar">
              <div className="video-pantheon__sort">
                <label className="video-pantheon__sort-label" htmlFor="vp-sort">Sort</label>
                <select
                  id="vp-sort"
                  className="video-pantheon__sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="az">Title A-Z</option>
                  <option value="za">Title Z-A</option>
                </select>
              </div>

              {shownCategories.length > 0 && (
                <nav className="video-pantheon__filters" aria-label="Filter by category">
                  <span className="video-pantheon__filters-title">Categories</span>
                  <button
                    type="button"
                    className={`video-pantheon__filter${!activeCategory ? " is-active" : ""}`}
                    onClick={() => setActiveCategory(null)}
                  >
                    All
                  </button>
                  {shownCategories.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className={`video-pantheon__filter${activeCategory === c.id ? " is-active" : ""}`}
                      onClick={() => setActiveCategory(c.id)}
                    >
                      {c.title}
                    </button>
                  ))}
                </nav>
              )}
            </aside>

            <div className="video-pantheon__shelf">
            {visible.map((v) => {
              const thumb = v.thumbnail_path || streamThumbnailUrl(v.stream_id);
              const dur = formatDuration(v.duration_seconds);
              const isActive = v.id === active?.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  className={`video-pantheon__tablet${isActive ? " is-enshrined" : ""}`}
                  onClick={() => enshrine(v)}
                  aria-pressed={isActive}
                >
                  <span className="video-pantheon__tablet-frame">
                    {thumb ? (
                      <Image
                        src={thumb}
                        alt=""
                        className="video-pantheon__tablet-thumb"
                        width={640}
                        height={360}
                        sizes="(max-width: 720px) 50vw, 300px"
                        loading="lazy"
                        // Bunny Stream's pull zone uses referer-based hotlink
                        // protection. Next's optimizer fetches server-side with
                        // no referer (-> 403), so load direct: the browser sends
                        // the page referer, which the zone allows.
                        unoptimized
                      />
                    ) : (
                      <span className="video-pantheon__tablet-blank" aria-hidden="true" />
                    )}
                    {dur && <span className="video-pantheon__tablet-dur">{dur}</span>}
                  </span>
                  <span className="video-pantheon__tablet-title">{v.title}</span>
                </button>
              );
            })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
