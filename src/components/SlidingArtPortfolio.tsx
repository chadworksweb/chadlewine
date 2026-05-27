"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { SlidingPortfolio, type PortfolioItem } from "@/lib/sliding-portfolio";
import "./SlidingArtPortfolio.css";

export function SlidingArtPortfolio({ items }: { items: PortfolioItem[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<SlidingPortfolio | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!containerRef.current) return;
    const instance = new SlidingPortfolio(containerRef.current, {
      items,
      fullscreen: true,
      // Clicking a piece goes straight to its detail page (no lightbox).
      onItemClick: (item) => router.push(`/art/${item.slug}`),
    });
    instanceRef.current = instance;
    return () => {
      instance.destroy();
      instanceRef.current = null;
    };
  }, [items, router]);

  return (
    <div className="sarp-gallery-container sarp-fullscreen" ref={containerRef}>
      <div className="sarp-portfolio-viewport" data-sarp-viewport>
        <div className="sarp-portfolio-grid" data-sarp-grid></div>
      </div>
      <div className="sarp-portfolio-bezel"></div>
    </div>
  );
}
