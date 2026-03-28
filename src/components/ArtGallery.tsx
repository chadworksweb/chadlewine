"use client";

import { useState } from "react";

interface ArtPiece {
  id: string;
  title: string;
  slug: string;
  medium: string | null;
  image_path: string;
  image_alt: string | null;
  description: string | null;
}

export function ArtGallery({ pieces }: { pieces: ArtPiece[] }) {
  const [active, setActive] = useState<ArtPiece | null>(null);

  return (
    <>
      {/* Modal viewer */}
      {active && (
        <div
          className="art-modal"
          onClick={() => setActive(null)}
        >
          <div className="art-modal__inner" onClick={(e) => e.stopPropagation()}>
            <img src={active.image_path} alt={active.image_alt || active.title} className="art-modal__img" />
            <div className="art-modal__info">
              <h2 className="art-modal__title">{active.title}</h2>
              {active.medium && <span className="art-modal__medium">{active.medium}</span>}
              {active.description && <p className="art-modal__desc">{active.description}</p>}
            </div>
            <button className="art-modal__close" onClick={() => setActive(null)}>&times;</button>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="art-grid">
        {pieces.map((p) => (
          <button key={p.id} className="art-grid__item" onClick={() => setActive(p)}>
            <img src={p.image_path} alt={p.image_alt || p.title} className="art-grid__img" />
            <span className="art-grid__label">{p.title}</span>
          </button>
        ))}
      </div>

      {pieces.length === 0 && (
        <p style={{ color: "var(--text-tertiary)" }}>No art published yet.</p>
      )}
    </>
  );
}
