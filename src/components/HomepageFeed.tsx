"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { HeroLens, type HeroLensItem } from "@/components/HeroLens";
import { FeedEntry } from "@/components/FeedEntry";
import { FeaturedTrack } from "@/components/FeaturedTrack";

const FEED_LIMIT = 10;

interface Song {
  id: string;
  slug: string;
  title: string;
  release_date: string | null;
  art_image_path: string | null;
  art_alt: string | null;
  hero_focal_x?: number | null;
  hero_focal_y?: number | null;
  song_summary: string | null;
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

interface CLStreamSong {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  note: string | null;
  source_url: string | null;
  rc_color: string | null;
  rc_charge: number | null;
  rc_charge_summary?: string | null;
  created_at: string;
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
      feedSongs.map((s) => ({
        slug: s.slug,
        title: s.title,
        date: s.release_date,
        hook: s.song_summary || "",
        artImagePath: s.art_image_path || "",
        artAlt: s.art_alt || s.title,
        href: `/music/songs/${s.slug}`,
        ctaLabel: "Listen →",
        focalX: s.hero_focal_x != null ? s.hero_focal_x / 100 : 0.5,
        focalY: s.hero_focal_y != null ? s.hero_focal_y / 100 : 0.5,
      })),
    [feedSongs]
  );

  useEffect(() => {
    const heading = headingRef.current;
    if (!heading) return;
    const stickyTopPx = parseFloat(getComputedStyle(heading).top) || 96;
    const io = new IntersectionObserver(
      ([entry]) =>
        setStuck(
          entry.intersectionRatio < 1 &&
          entry.boundingClientRect.top <= stickyTopPx
        ),
      { rootMargin: `-${stickyTopPx + 1}px 0px 0px 0px`, threshold: [1] }
    );
    io.observe(heading);
    return () => io.disconnect();
  }, []);

  return (
    <>
      {heroItems.length > 0 && <HeroLens items={heroItems} />}

      <div className="home-split">
        <section className="home-split__observations">
          <h2 ref={headingRef} className={`home-split__section-heading${stuck ? " is-stuck" : ""}`}>Songs</h2>
          {feedSongs.length > 0 && (
            <div className="archive__feed">
              {feedSongs.map((song) => (
                <div key={song.slug} className="archive__feed-item">
                  <FeedEntry
                    title={song.title}
                    slug={song.slug}
                    dateCaptured={song.release_date || ""}
                    hookLine={song.song_summary || ""}
                    artImageUrl={song.art_image_path || ""}
                    artAlt={song.art_alt || song.title}
                    href={`/music/songs/${song.slug}`}
                  />
                </div>
              ))}
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
              <h2 className="home-split__section-heading">Featured Track</h2>
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
                  const date = new Date(s.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
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
