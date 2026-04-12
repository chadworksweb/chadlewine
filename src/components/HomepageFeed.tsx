"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { HeroLens } from "@/components/HeroLens";
import { FeedEntry } from "@/components/FeedEntry";

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

interface HomepageFeedProps {
  observations: Observation[];
  sidebar: React.ReactNode;
}

export function HomepageFeed({ observations, sidebar }: HomepageFeedProps) {
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

        {sidebar}
      </div>
    </>
  );
}
