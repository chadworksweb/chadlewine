"use client";

import { HeroLens, type HeroLensItem } from "@/components/HeroLens";

export function AlbumSongSliderSection({ items }: { items: HeroLensItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="album-section album-section--slider" aria-labelledby="album-section-songs">
      <div className="album-section__inner">
        <h2 className="album-section__heading" id="album-section-songs">Songs</h2>
      </div>
      <HeroLens items={items} />
    </section>
  );
}
