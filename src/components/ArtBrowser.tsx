"use client";

import { useEffect, useState } from "react";
import { SlidingArtPortfolio } from "./SlidingArtPortfolio";
import { ArtGrid } from "./ArtGrid";
import type { PortfolioItem } from "@/lib/sliding-portfolio";
import "./ArtBrowser.css";

type Mode = "slide" | "grid";

const GridIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
  </svg>
);

const SlideIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 9 2 12l3 3" />
    <path d="m19 9 3 3-3 3" />
    <path d="M9 5 12 2l3 3" />
    <path d="m9 19 3 3 3-3" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);

export function ArtBrowser({ items }: { items: PortfolioItem[] }) {
  const [mode, setMode] = useState<Mode>("slide");

  // Immersive mode is a fixed-fullscreen view: no page scroll and no global
  // footer (the body.art-immersive class hides the footer siblings and locks
  // scroll). The grid is a normal page, so it scrolls and shows the footer like
  // any other entity page.
  useEffect(() => {
    if (mode !== "slide") return;
    document.body.classList.add("art-immersive");
    return () => document.body.classList.remove("art-immersive");
  }, [mode]);

  return (
    <>
      <button
        type="button"
        className={`art-view-toggle art-view-toggle--${mode}`}
        onClick={() => setMode((m) => (m === "slide" ? "grid" : "slide"))}
        aria-label={mode === "slide" ? "Switch to grid view" : "Switch to immersive view"}
        title={mode === "slide" ? "Grid view" : "Immersive view"}
      >
        {mode === "slide" ? <GridIcon /> : <SlideIcon />}
      </button>

      {/* key forces a clean remount; the incoming view fades in. */}
      <div key={mode} className="art-browser__view">
        {mode === "slide" ? <SlidingArtPortfolio items={items} /> : <ArtGrid items={items} />}
      </div>
    </>
  );
}
