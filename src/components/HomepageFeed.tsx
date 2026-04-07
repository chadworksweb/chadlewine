"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { HeroLens, type HeroLensHandle } from "@/components/HeroLens";
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
  const feedRefs = useRef<(HTMLDivElement | null)[]>([]);
  const lensTriggered = useRef(false);
  const lensRef = useRef<HeroLensHandle>(null);

  // Lens changed — scroll feed to match (but suppress scroll-observer feedback)
  const handleLensChange = useCallback((index: number) => {
    lensTriggered.current = true;
    setActiveIndex(index);
    const el = feedRefs.current[index];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    // Release after scroll settles
    setTimeout(() => { lensTriggered.current = false; }, 800);
  }, []);

  // Scroll observer — topmost visible feed item drives the active index
  useEffect(() => {
    const els = feedRefs.current.filter(Boolean) as HTMLDivElement[];
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      () => {
        if (lensTriggered.current) return;

        // Find the topmost feed item that's in view
        let topIndex = 0;
        let topY = Infinity;
        for (let i = 0; i < els.length; i++) {
          const el = feedRefs.current[i];
          if (!el) continue;
          const rect = el.getBoundingClientRect();
          // Item is at least partially visible
          if (rect.bottom > 0 && rect.top < window.innerHeight) {
            if (rect.top < topY) {
              topY = rect.top;
              topIndex = i;
            }
          }
        }

        setActiveIndex((prev) => {
          if (prev !== topIndex) {
            lensRef.current?.goTo(topIndex);
            return topIndex;
          }
          return prev;
        });
      },
      { threshold: 0.1 }
    );

    for (const el of els) observer.observe(el);
    return () => observer.disconnect();
  }, [observations.length]);

  return (
    <>
      {observations.length > 0 && (
        <HeroLens
          ref={lensRef}
          observations={observations}
          onIndexChange={handleLensChange}
        />
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
                  className={`archive__feed-item${i === activeIndex ? " archive__feed-item--active" : ""}`}
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
