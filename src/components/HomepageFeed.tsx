"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { HeroLens } from "@/components/HeroLens";
import { FeedEntry } from "@/components/FeedEntry";
import { FeaturedTrack } from "@/components/FeaturedTrack";

const FEED_LIMIT = 10;

interface Observation {
  slug: string;
  title: string;
  date_captured: string;
  hook_line: string;
  art_image_path: string;
  art_alt: string;
  categories: { title: string; slug: string }[];
  tags: { label: string; slug: string }[];
}

interface Meditation {
  id: string;
  subtitle: string | null;
  body: string | null;
  plain_text: string | null;
  published_at: string | null;
  created_at: string;
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

interface HomepageFeedProps {
  observations: Observation[];
  featuredTrack: FeaturedTrackData | null;
  meditations: Meditation[];
}

export function HomepageFeed({ observations, featuredTrack, meditations }: HomepageFeedProps) {
  const feedObs = useMemo(() => observations.slice(0, FEED_LIMIT), [observations]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [stuck, setStuck] = useState(false);

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
      {feedObs.length > 0 && <HeroLens observations={feedObs} />}

      <div className="home-split">
        <section className="home-split__observations">
          <h2 ref={headingRef} className={`home-split__section-heading${stuck ? " is-stuck" : ""}`}>Observations</h2>
          {feedObs.length > 0 && (
            <div className="archive__feed">
              {feedObs.map((obsv) => (
                <div key={obsv.slug} className="archive__feed-item">
                  <FeedEntry
                    title={obsv.title}
                    slug={obsv.slug}
                    dateCaptured={obsv.date_captured}
                    hookLine={obsv.hook_line || ""}
                    artImageUrl={obsv.art_image_path || ""}
                    artAlt={obsv.art_alt || obsv.title}
                  />
                </div>
              ))}
              <div className="archive__feed-item archive__feed-item--viewAll">
                <Link href="/observations" className="archive__feed-view-all">
                  View All Observations →
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
          {meditations.length > 0 && (
            <div className="home-split__sidebar-block">
              <h2 className="home-split__section-heading">Meditations</h2>
              <div className="home-split__meditations-feed">
                {meditations.map((med) => (
                  <Link
                    key={med.id}
                    href={`/meditations/${med.id}`}
                    className="home-med-row"
                  >
                    <span className="home-med-row__label">{med.subtitle || "new meditation"}</span>
                    <span className="home-med-row__date">{new Date(med.published_at || med.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })}</span>
                  </Link>
                ))}
              </div>
              <Link href="/meditations" className="home-split__meditations-more">
                All Meditations
              </Link>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}
