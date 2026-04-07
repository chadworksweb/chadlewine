"use client";

import { useState } from "react";
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
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <>
      {observations.length > 0 && (
        <HeroLens observations={observations} onIndexChange={setActiveIndex} />
      )}

      <div className="home-split">
        <section className="home-split__observations">
          <h2 className="home-split__section-heading">Observations</h2>
          {observations.length > 0 && (
            <div className="archive__feed">
              {observations.map((obsv, i) => (
                <div
                  key={obsv.slug}
                  className={`archive__feed-item${i === activeIndex ? " archive__feed-item--inFocus" : ""}`}
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
