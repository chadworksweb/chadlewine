import Link from "next/link";
import type { PortfolioItem } from "@/lib/sliding-portfolio";
import { focalCropStyle } from "@/lib/focal-crop";
import "./ArtGrid.css";

// A traditional entity grid (like /merch, like the discography): square
// thumbnail with the title below, 4 across. A normal, page-scrolling layout --
// no slider mechanics.
export function ArtGrid({ items }: { items: PortfolioItem[] }) {
  return (
    <div className="art-grid">
      {items.map((it) => {
        const meta = it.meta
          ? [it.meta.line1, it.meta.line2, it.meta.line3].filter(Boolean).join(" · ")
          : "";
        return (
          <Link key={it.id} href={`/art/${it.slug}`} className="art-grid__card">
            <div className="art-grid__img-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={it.main}
                alt={it.title}
                className="art-grid__img"
                style={focalCropStyle(it.focalX, it.focalY, it.zoom)}
                loading="lazy"
                decoding="async"
              />
              {it.sold && <span className="art-grid__sold">Sold</span>}
            </div>
            <h3 className="art-grid__title">{it.title}</h3>
            {meta && <p className="art-grid__meta">{meta}</p>}
          </Link>
        );
      })}
    </div>
  );
}
