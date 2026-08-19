"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { PantheonStage, type PantheonVideo } from "./PantheonStage";
import { streamThumbnailUrl } from "@/lib/bunny-stream";

interface Category { id: string; title: string; slug: string; }

const SORTS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "az", label: "Title A-Z" },
  { value: "za", label: "Title Z-A" },
] as const;

type SortKey = (typeof SORTS)[number]["value"];

// Sort control for the collection rail. A native <select> cannot theme its own
// popup -- the rows keep the OS highlight and square corners no matter what the
// stylesheet says -- so this renders its own listbox in the temple's palette,
// the same trade InterestSelect makes for the inquiry form. Value lives in the
// parent's state, so unlike InterestSelect there is no hidden input and no
// form-reset handling.
function SortSelect({
  value,
  onChange,
  labelledBy,
}: {
  value: SortKey;
  onChange: (v: SortKey) => void;
  labelledBy: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => SORTS.findIndex((o) => o.value === value));
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = SORTS.find((o) => o.value === value) ?? SORTS[0];

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocPointer);
    return () => document.removeEventListener("mousedown", onDocPointer);
  }, [open]);

  const choose = (v: SortKey) => {
    onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setActive((i) => Math.min(i + 1, SORTS.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open) choose(SORTS[active].value);
      else { setActive(SORTS.findIndex((o) => o.value === value)); setOpen(true); }
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className="vp-sort" ref={rootRef}>
      <button
        type="button"
        className="vp-sort__btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${labelledBy} ${listId}-value`}
        onClick={() => {
          setActive(SORTS.findIndex((o) => o.value === value));
          setOpen((o) => !o);
        }}
        onKeyDown={onKeyDown}
      >
        <span id={`${listId}-value`}>{selected.label}</span>
        <span className="vp-sort__chevron" aria-hidden="true" />
      </button>
      {open && (
        <ul className="vp-sort__list" role="listbox" id={listId} aria-labelledby={labelledBy}>
          {SORTS.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`vp-sort__opt${i === active ? " is-active" : ""}${
                o.value === value ? " is-selected" : ""
              }`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o.value);
              }}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoPantheon({
  categories,
  videos,
  activeSlug = null,
}: {
  categories: Category[];
  videos: PantheonVideo[];
  // Set on /videos/[slug]: that video starts on the stage. Null on the library
  // index, where the featured video leads.
  activeSlug?: string | null;
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

  // The route decides which video is enshrined; the library index falls back to
  // the featured one, then the first published. Resolved during render (not in
  // an effect) so the server and the first client render agree and the page
  // stays prerenderable.
  const initial = useMemo(
    () =>
      (activeSlug ? decorated.find((v) => v.slug === activeSlug) : null) ??
      decorated.find((v) => v.is_featured) ??
      decorated[0] ??
      null,
    [decorated, activeSlug],
  );

  const [activeId, setActiveId] = useState<string | null>(initial?.id ?? null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("newest");
  const stageRef = useRef<HTMLDivElement | null>(null);

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
    // Swap in place rather than navigate -- the stage is meant to change under
    // you, not reload. The URL still becomes the video's real page, so a reload,
    // a copy, or a share all land on the prerendered /videos/[slug] route.
    window.history.replaceState(null, "", `/videos/${v.slug}`);
    // Bring the stage into view -- the relic returns to the altar.
    stageRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function share(v: PantheonVideo) {
    const url = `${window.location.origin}/videos/${v.slug}`;
    if (navigator.share) {
      navigator.share({ title: v.title, url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url).catch(() => {});
    }
  }

  // The filter rail and the collection only exist once there is more than one
  // video to choose between; with a single video the temple takes the full
  // width on its own.
  const hasLibrary = decorated.length > 1;

  return (
    <div className={`video-pantheon${hasLibrary ? "" : " video-pantheon--solo"}`}>
      {hasLibrary && (
        <aside className="video-pantheon__sidebar">
          <div className="video-pantheon__sort">
            <span className="video-pantheon__sort-label" id="vp-sort-label">Sort</span>
            <SortSelect value={sortBy} onChange={setSortBy} labelledBy="vp-sort-label" />
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
      )}

      <div className="video-pantheon__main">
        <div className="video-pantheon__stage" ref={stageRef}>
          <PantheonStage video={active} onShare={share} />
        </div>

        {hasLibrary && (
          <div className="video-pantheon__library">
            <h2 className="video-pantheon__library-title">The Collection</h2>
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
        )}
      </div>
    </div>
  );
}
