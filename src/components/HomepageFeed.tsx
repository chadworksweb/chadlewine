"use client";

import { useState, useRef, useEffect } from "react";
import { HeroLens } from "@/components/HeroLens";
import { FeedEntry } from "@/components/FeedEntry";

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
  const [lensIndex, setLensIndex] = useState(0);
  const feedRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Scroll the active feed item into view when lens changes
  useEffect(() => {
    const el = feedRefs.current[lensIndex];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [lensIndex]);

  return (
    <>
      {observations.length > 0 && (
        <HeroLens observations={observations} onIndexChange={setLensIndex} />
      )}

      <div className="home-split">
        <section className="home-split__observations">
          <h2 className="home-split__section-heading">Observations</h2>
          {observations.length > 0 && (
            <div className="archive__feed">
              {observations.map((obsv, i) => (
                <div
                  key={obsv.slug}
                  ref={(el) => { feedRefs.current[i] = el; }}
                  className={`archive__feed-item${i === lensIndex ? " archive__feed-item--active" : ""}`}
                >
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
            </div>
          )}
        </section>

        {sidebar}
      </div>
    </>
  );
}
