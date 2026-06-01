"use client";

import { useState, useCallback, useRef, useLayoutEffect } from "react";
import Link from "next/link";
import Image from "next/image";

// Shrinks an element's font-size until its (overflow-hidden, max-height-capped)
// content fits — keeps the meta block a fixed height regardless of how long a
// given song's title/summary is, so it never jumps between songs.
function useFitText<T extends HTMLElement>(
  maxPx: number,
  minPx: number,
  deps: React.DependencyList,
) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      // Budget = the element's CSS max-height. Comparing scrollHeight to a fixed
      // budget avoids the ~2px line-box rounding that makes scrollHeight read
      // a hair over clientHeight even when a single line clearly fits.
      const maxH = parseFloat(getComputedStyle(el).maxHeight);
      let size = maxPx;
      el.style.fontSize = `${size}px`;
      if (!Number.isFinite(maxH)) return; // no cap (e.g. mobile) — keep max size
      // Leave a little slack below the budget so the last line's descenders
      // never sit at the overflow:hidden clip edge.
      const budget = maxH - 8;
      let guard = 0;
      while (el.scrollHeight > budget && size > minPx && guard < 160) {
        size -= 0.5;
        el.style.fontSize = `${size}px`;
        guard++;
      }
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

interface ExploreSong {
  id: string;
  title: string;
  slug: string;
  song_summary: string | null;
  art_image_path: string | null;
  art_alt: string | null;
  album: {
    title: string;
    slug: string;
    cover_art_path: string | null;
    cover_art_alt: string | null;
  } | null;
}

function ShuffleIcon() {
  return (
    <svg
      className="explore-songs__shuffle-icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  );
}

function resolveArt(s: ExploreSong): { src: string | null; alt: string } {
  const src = s.art_image_path || s.album?.cover_art_path || null;
  const alt = s.art_alt || s.album?.cover_art_alt || s.title;
  return { src, alt };
}

interface ExploreSongsProps {
  songs: ExploreSong[];
  showHeading?: boolean;
  showFooter?: boolean;
  showViewAll?: boolean;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const nextFrame = () =>
  new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

// idle: normal coverflow. collapse: cards piled behind center (static).
// shuffle: the pile riffles. fan: cards springing back out to coverflow.
type Phase = "idle" | "collapse" | "shuffle" | "fan";

export function ExploreSongs({ songs: initialSongs, showHeading = true, showFooter = true, showViewAll = true }: ExploreSongsProps) {
  const [songs, setSongs] = useState<ExploreSong[]>(initialSongs);
  const [active, setActive] = useState(Math.floor(initialSongs.length / 2));
  const [phase, setPhase] = useState<Phase>("idle");
  // Covers the center while the new center image loads, so it doesn't blink.
  const [coverCenter, setCoverCenter] = useState(false);
  const centerReadyRef = useRef(true);

  const shuffle = useCallback(async () => {
    if (phase !== "idle") return;

    // Kick off the fetch immediately; the animation hides the latency.
    const fetchPromise = fetch("/api/explore-songs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { songs?: ExploreSong[] } | null) =>
        d?.songs && d.songs.length > 0 ? d.songs : null,
      )
      .catch(() => null);

    // 1. Collapse the fanned cards into a pile, with the placeholder taking
    //    over the center immediately (cards slide in behind it).
    centerReadyRef.current = false;
    setCoverCenter(true);
    setPhase("collapse");
    await wait(440);

    // 2. Riffle the pile — the "shuffling" beat.
    setPhase("shuffle");
    const [next] = await Promise.all([fetchPromise, wait(680)]);

    // 3. Swap to the new songs while still piled + covered.
    setPhase("collapse");
    if (next) {
      setSongs(next);
      setActive(Math.floor(next.length / 2));
      // No image to wait on (art-less cover) — don't hold the placeholder.
      if (!resolveArt(next[Math.floor(next.length / 2)]).src) {
        centerReadyRef.current = true;
      }
    }

    // 4. Fan the new cards out to their coverflow positions.
    await nextFrame();
    setPhase("fan");
    await wait(560);

    // 5. Hold the placeholder until the new center image has loaded (onLoad
    //    flips the ref), then reveal. Short cap so it can't feel sluggish if
    //    the load event is missed (e.g. a cached image).
    const start = Date.now();
    while (!centerReadyRef.current && Date.now() - start < 600) {
      await wait(50);
    }
    setCoverCenter(false);
    setPhase("idle");
  }, [phase]);

  const shuffling = phase !== "idle";

  // Fit the title + summary into the fixed-height meta block. Re-runs when the
  // shown song changes (phase returns to idle) so each song's text scales to fit.
  const titleRef = useFitText<HTMLHeadingElement>(28, 16, [songs[active]?.title, phase]);
  const summaryRef = useFitText<HTMLParagraphElement>(18, 11, [songs[active]?.song_summary, phase]);

  if (!songs || songs.length === 0) return null;

  const current = songs[active];
  const last = songs.length - 1;

  return (
    <section className="explore-songs">
      {showHeading && (
        <div className="glyph-title-bar glyph-title-bar--top">
          <span className="glyph-title-bar__label" aria-hidden="true">░▒▓█</span>
          <h2 className="glyph-title-bar__heading">Browse Chad Lewine Songs</h2>
          <span className="glyph-title-bar__label" aria-hidden="true">█▓▒░</span>
        </div>
      )}

      <div className="explore-songs__inner site-contain">

        <div className={`coverflow${shuffling ? " coverflow--busy" : ""}`}>
          <button
            type="button"
            className="coverflow__nav coverflow__nav--prev"
            onClick={() => setActive((a) => Math.max(0, a - 1))}
            disabled={active === 0 || shuffling}
            aria-label="Previous song"
          >
            <span className="coverflow__nav-glyph">❮</span>
          </button>

          <div className="coverflow__stage">
            {songs.map((s, i) => {
              const offset = i - active;
              const abs = Math.abs(offset);
              const isActive = i === active;
              const piled = phase === "collapse" || phase === "shuffle";

              const style: React.CSSProperties = {
                zIndex: 100 - abs,
                // Keep the visible cards on while piled so they stack behind
                // center; far ones stay hidden.
                opacity: abs > 5 ? 0 : 1,
                pointerEvents: shuffling || abs > 5 || isActive ? "none" : "auto",
              };

              if (piled) {
                // Stacked behind the center image (small z-stagger for depth).
                style.transform = `translateX(0px) translateZ(${-abs * 5}px) rotateY(0deg)`;
                if (phase === "shuffle" && !isActive) {
                  const dir = i % 2 === 0 ? 1 : -1;
                  style.animation = "coverflow-riffle 300ms ease-in-out 2";
                  style.animationDelay = `${abs * 28}ms`;
                  (style as Record<string, string>)["--riffle-x"] = `${dir * (44 + abs * 7)}px`;
                  (style as Record<string, string>)["--riffle-r"] = `${dir * 9}deg`;
                }
              } else {
                style.transform = `translateX(${offset * 148}px) translateZ(${-abs * 160}px) rotateY(${offset * -19}deg)`;
              }

              return (
                <button
                  type="button"
                  key={s.id}
                  className={`coverflow__card${isActive ? " coverflow__card--active" : ""}`}
                  style={style}
                  onClick={isActive ? undefined : () => setActive(i)}
                  aria-label={s.title}
                >
                  {(() => {
                    const { src, alt } = resolveArt(s);
                    return src ? (
                      <Image
                        src={src}
                        alt={alt}
                        width={600}
                        height={600}
                        sizes="(max-width: 640px) 60vw, 360px"
                        className="coverflow__art"
                        onLoad={isActive ? () => { centerReadyRef.current = true; } : undefined}
                      />
                    ) : (
                      <div className="coverflow__art coverflow__art--empty" />
                    );
                  })()}
                </button>
              );
            })}

            {coverCenter && (
              <div className="coverflow__placeholder" aria-hidden="true">
                <span className="coverflow__placeholder-spin" />
              </div>
            )}
          </div>

          <button
            type="button"
            className="coverflow__nav coverflow__nav--next"
            onClick={() => setActive((a) => Math.min(last, a + 1))}
            disabled={active === last || shuffling}
            aria-label="Next song"
          >
            <span className="coverflow__nav-glyph">❯</span>
          </button>
        </div>

        <div className="explore-songs__meta">
          <div className="explore-songs__heading">
            {shuffling ? (
              <>
                <span className="explore-songs__skeleton" style={{ width: "78%", height: "1.6rem" }} />
                <span className="explore-songs__skeleton" style={{ width: "45%", height: "0.7rem" }} />
              </>
            ) : (
              <>
                <h3 ref={titleRef} className="explore-songs__title">{current.title}</h3>
                <span className="explore-songs__album">
                  from{" "}
                  {current.album ? (
                    <Link
                      href={`/music/releases/${current.album.slug}`}
                      className="explore-songs__album-link"
                    >
                      <em>{current.album.title}</em>
                    </Link>
                  ) : (
                    <em>{current.title}</em>
                  )}
                </span>
              </>
            )}
          </div>

          <div className="explore-songs__detail-row">
            <p ref={summaryRef} className="explore-songs__summary">
              {shuffling ? (
                <>
                  <span className="explore-songs__skeleton" style={{ width: "100%" }} />
                  <span className="explore-songs__skeleton" style={{ width: "94%" }} />
                  <span className="explore-songs__skeleton" style={{ width: "58%" }} />
                </>
              ) : (
                current.song_summary || "A short summary of this song will appear here — capturing the essence of the track in a sentence or two."
              )}
            </p>
            <Link
              href={`/music/songs/${current.slug}`}
              className="explore-songs__cta"
            >
              Explore →
            </Link>
          </div>
        </div>
      </div>

      {showFooter && (
        <div className="explore-songs__footer">
          <button
            type="button"
            className="explore-songs__cta explore-songs__cta--shuffle"
            onClick={shuffle}
            disabled={shuffling}
          >
            <ShuffleIcon />
            {shuffling ? "Shuffling…" : "Shuffle More Songs"}
          </button>
          {showViewAll && (
            <Link href="/music/songs" className="home-merch__view-all">
              View All Songs →
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
