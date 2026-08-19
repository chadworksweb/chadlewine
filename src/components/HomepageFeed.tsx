"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { HeroLens, type HeroLensItem } from "@/components/HeroLens";
import { FeedEntry } from "@/components/FeedEntry";
import { FeaturedTrack } from "@/components/FeaturedTrack";

const FEED_LIMIT = 15;
// Stable identity for "nothing pinned", so an absent prop does not hand
// HeroLens a fresh array on every render.
const EMPTY_HERO_ITEMS: HeroLensItem[] = [];

// Pinned to a FIXED timezone so the string is identical whether it is
// computed on the server (Vercel = UTC) or in the visitor's browser. Using
// the bare local-time getters (getHours/getMonth/...) makes the output
// depend on the runtime's timezone, which produces a server/client text
// mismatch and a React hydration crash (#418) that takes down the whole
// client tree. Never format SSR'd dates with local-time getters.
//
// Pinning the timezone was necessary and not sufficient. The LITERALS between
// the fields are ICU's to choose, and CLDR has changed its mind about them:
// en-US joins a date to a time as either "{date}, {time}" or "{date} at {time}"
// depending on the ICU version, and separates the clock from AM/PM with either a
// plain space or U+202F NARROW NO-BREAK SPACE. Two runtimes on the same date, in
// the same timezone, in the same locale therefore disagree by bytes that are
// invisible on screen. Measured on this page: Node 24 (ICU 77) rendered
// "Jul 27, 2026, 7:06:38 PM" while an iPhone rendered "Jul 27, 2026 at 7:06:38
// PM", which is #418 again, and it wiped every class the hero had stamped on
// <html> for its intro along with the rest of the tree.
//
// So no ICU literal reaches the output. formatToParts hands over the fields and
// this builds the string from them with literals written HERE, which is the only
// version of this that cannot drift out from under the next runtime upgrade.
const STREAM_DATE_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

function formatStreamDate(iso: string): string {
  const f: Record<string, string> = {};
  for (const part of STREAM_DATE_FMT.formatToParts(new Date(iso))) {
    if (part.type !== "literal") f[part.type] = part.value;
  }
  // dayPeriod is upper-cased rather than trusted: en-US has shipped both "PM"
  // and "pm" across CLDR releases, and it costs nothing to make it ours.
  const ampm = (f.dayPeriod || "").toUpperCase();
  return `${f.month} ${f.day}, ${f.year}, ${f.hour}:${f.minute}:${f.second} ${ampm}`;
}

interface Song {
  id: string;
  slug: string;
  title: string;
  release_date: string | null;
  art_image_path: string | null;
  art_alt: string | null;
  hero_focal_x?: number | null;
  hero_focal_y?: number | null;
  hero_zoom?: number | null;
  card_focal_x?: number | null;
  card_focal_y?: number | null;
  card_zoom?: number | null;
  song_summary: string | null;
  album_cover_path?: string | null;
  album_cover_alt?: string | null;
  album_hero_focal_x?: number | null;
  album_hero_focal_y?: number | null;
  album_hero_zoom?: number | null;
  album_card_focal_x?: number | null;
  album_card_focal_y?: number | null;
  album_card_zoom?: number | null;
}

interface FeaturedTrackData {
  song: {
    id: string;
    title: string;
    slug: string;
    track_number: number;
    duration_seconds: number | null;
    streaming_path: string | null;
    song_summary: string | null;
    playback_mode?: string | null;
  };
  album: {
    title: string;
    slug: string;
    cover_art_path: string | null;
    cover_art_alt: string | null;
  };
  playbackMode: "preview" | "full";
}

import type { RisingCompassBadgeData } from "@/lib/rising-compass";

interface CLStreamSong {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  note: string | null;
  source_url: string | null;
  created_at: string;
  badge: RisingCompassBadgeData | null;
}

interface HomepageFeedProps {
  songs: Song[];
  featuredTrack: FeaturedTrackData | null;
  clStreamSongs: CLStreamSong[];
  /** THE hero. Every slide, in admin order. Nothing is added to this. */
  curatedHeroItems?: HeroLensItem[];
}

export function HomepageFeed({ songs, featuredTrack, clStreamSongs, curatedHeroItems }: HomepageFeedProps) {
  const feedSongs = useMemo(() => songs.slice(0, FEED_LIMIT), [songs]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [stuck, setStuck] = useState(false);

  // THE HERO IS EXACTLY WHAT THE ADMIN PINS, in `display_order`. It used to be
  // "pins lead, then backfill from the latest songs up to a target count", which
  // meant most of the carousel was chosen by a database sort rather than by
  // anyone: pinning four slides still produced ten, and the six nobody picked
  // moved on their own whenever the song feed changed. The pin list is now the
  // whole answer, so the count is however many are pinned and there is no
  // target to reach. The `songs` prop is still needed below, for Latest Songs.
  const heroItems = curatedHeroItems ?? EMPTY_HERO_ITEMS;

  // Toggle `is-stuck` directly via DOM in a rAF-throttled scroll listener
  // so the mask flips on/off in the SAME frame the scroll is painted.
  // IntersectionObserver fires async on the next frame, which produced the
  // visible "flash" of content scrolling behind a partially-attached mask.
  useEffect(() => {
    const heading = headingRef.current;
    if (!heading) return;
    const stickyTopPx = parseFloat(getComputedStyle(heading).top) || 96;
    let rafId = 0;
    let lastStuck = false;
    const sync = () => {
      rafId = 0;
      const top = heading.getBoundingClientRect().top;
      const stuck = top <= stickyTopPx + 0.5;
      if (stuck !== lastStuck) {
        lastStuck = stuck;
        heading.classList.toggle("is-stuck", stuck);
        setStuck(stuck);
      }
    };
    const onScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(sync);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    sync();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <>
      {heroItems.length > 0 && <HeroLens items={heroItems} />}

      <div className="home-split" data-nav-keep-until>
        <section className="home-split__observations">
          <h2 ref={headingRef} className={`home-split__section-heading${stuck ? " is-stuck" : ""}`}>Latest Songs</h2>
          {feedSongs.length > 0 && (
            <div className="archive__feed">
              {feedSongs.map((song) => {
                const useAlbumImage = !song.art_image_path && !!song.album_cover_path;
                const fx = useAlbumImage ? song.album_hero_focal_x : song.hero_focal_x;
                const fy = useAlbumImage ? song.album_hero_focal_y : song.hero_focal_y;
                const fz = useAlbumImage ? song.album_hero_zoom : song.hero_zoom;
                return (
                  <div key={song.slug} className="archive__feed-item">
                    <FeedEntry
                      title={song.title}
                      slug={song.slug}
                      songSummary={song.song_summary || ""}
                      artImageUrl={song.art_image_path || song.album_cover_path || ""}
                      artAlt={song.art_alt || song.album_cover_alt || song.title}
                      href={`/music/songs/${song.slug}`}
                      focalX={fx}
                      focalY={fy}
                      zoom={fz}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <aside className="home-split__sidebar">
          {featuredTrack && (
            <div className="home-split__sidebar-block">
              <h2 className="home-split__section-heading">Featured Song</h2>
              <div className="featured-track__inner">
                <FeaturedTrack
                  song={featuredTrack.song}
                  album={featuredTrack.album}
                  playbackMode={featuredTrack.playbackMode}
                />
              </div>
            </div>
          )}
          {clStreamSongs.length > 0 && (
            <div className="home-split__sidebar-block">
              <h2 className="home-split__section-heading">
                {"CL Stream"}
                <span className="home-split__section-sub">what I&rsquo;m listening to</span>
              </h2>
              <div className="home-split__sidebar-feed">
                {clStreamSongs.map((s) => {
                  const label = `${s.title} — ${s.artist}`;
                  const date = formatStreamDate(s.created_at);
                  const inner = (
                    <>
                      <span className="home-sidebar-row__label">{label}</span>
                      <span className="home-sidebar-row__date">{date}</span>
                    </>
                  );
                  return s.source_url ? (
                    <a
                      key={s.id}
                      href={s.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="home-sidebar-row"
                    >
                      {inner}
                    </a>
                  ) : (
                    <span key={s.id} className="home-sidebar-row">{inner}</span>
                  );
                })}
              </div>
              <Link href="/curation/cl-stream" className="home-split__sidebar-more">
                All CL Stream
              </Link>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
