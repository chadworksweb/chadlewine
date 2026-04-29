"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { HeroLens, type HeroLensItem } from "@/components/HeroLens";
import { FeedEntry } from "@/components/FeedEntry";
import { FeaturedTrack } from "@/components/FeaturedTrack";

const FEED_LIMIT = 10;

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatStreamDate(iso: string): string {
  const d = new Date(iso);
  const month = MONTH_ABBR[d.getMonth()];
  const day = d.getDate();
  const year = d.getFullYear();
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${month} ${day}, ${year}, ${h}:${m}:${s} ${ampm}`;
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
}

export function HomepageFeed({ songs, featuredTrack, clStreamSongs }: HomepageFeedProps) {
  const feedSongs = useMemo(() => songs.slice(0, FEED_LIMIT), [songs]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [stuck, setStuck] = useState(false);

  const heroItems: HeroLensItem[] = useMemo(
    () =>
      feedSongs.map((s) => {
        // When falling back to the album cover, use the album's focal data —
        // the song's focal points were calibrated for a different image.
        const useAlbumImage = !s.art_image_path && !!s.album_cover_path;
        const fx = useAlbumImage ? s.album_hero_focal_x : s.hero_focal_x;
        const fy = useAlbumImage ? s.album_hero_focal_y : s.hero_focal_y;
        const fz = useAlbumImage ? s.album_hero_zoom : s.hero_zoom;
        return {
          slug: s.slug,
          title: s.title,
          date: s.release_date,
          artImagePath: s.art_image_path || s.album_cover_path || "",
          artAlt: s.art_alt || s.album_cover_alt || s.title,
          href: `/music/songs/${s.slug}`,
          ctaLabel: "Listen →",
          focalX: fx != null ? fx / 100 : 0.5,
          focalY: fy != null ? fy / 100 : 0.5,
          zoom: fz != null && fz >= 1 ? fz : 1,
        };
      }),
    [feedSongs]
  );

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
          <h2 ref={headingRef} className={`home-split__section-heading${stuck ? " is-stuck" : ""}`}>Songs</h2>
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
              <div className="archive__feed-item archive__feed-item--viewAll">
                <Link href="/music/songs" className="archive__feed-view-all">
                  View All Songs →
                </Link>
              </div>
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
              <h2 className="home-split__section-heading">CL Stream</h2>
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
