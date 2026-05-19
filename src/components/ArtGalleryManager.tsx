"use client";

import { useState } from "react";
import { MediaLibrary } from "./MediaLibrary";
import "./ArtGalleryManager.css";

export function ArtGalleryManager({
  paths,
  onChange,
}: {
  paths: string[];
  onChange: (next: string[]) => void;
}) {
  const [libraryOpen, setLibraryOpen] = useState(false);

  function addUrl(url: string) {
    onChange([...paths, url]);
    setLibraryOpen(false);
  }

  function removeAt(i: number) {
    if (!confirm("Remove this image from the gallery?")) return;
    onChange(paths.filter((_, idx) => idx !== i));
  }

  function moveUp(i: number) {
    if (i <= 0) return;
    const next = [...paths];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    onChange(next);
  }

  function moveDown(i: number) {
    if (i >= paths.length - 1) return;
    const next = [...paths];
    [next[i + 1], next[i]] = [next[i], next[i + 1]];
    onChange(next);
  }

  return (
    <div className="art-gallery-manager">
      <div className="art-gallery-manager__grid">
        {paths.map((url, i) => (
          <div key={`${url}-${i}`} className="art-gallery-manager__item">
            {/* eslint-disable-next-line @next/next/no-img-element -- admin-only gallery thumbnail */}
            <img src={url} alt="" className="art-gallery-manager__thumb" />
            <div className="art-gallery-manager__index">{i + 1}</div>
            <div className="art-gallery-manager__controls">
              <button type="button" className="art-gallery-manager__ctrl" onClick={() => moveUp(i)} disabled={i === 0} aria-label="Move up" title="Move up">↑</button>
              <button type="button" className="art-gallery-manager__ctrl" onClick={() => moveDown(i)} disabled={i === paths.length - 1} aria-label="Move down" title="Move down">↓</button>
              <button type="button" className="art-gallery-manager__ctrl art-gallery-manager__ctrl--remove" onClick={() => removeAt(i)} aria-label="Remove" title="Remove">×</button>
            </div>
          </div>
        ))}
        <button
          type="button"
          className="art-gallery-manager__add"
          onClick={() => setLibraryOpen(true)}
        >
          <span>+ Add Image</span>
        </button>
      </div>
      {paths.length === 0 && (
        <p className="art-gallery-manager__empty">No additional images yet. Click &ldquo;Add Image&rdquo; to upload or pick from the library.</p>
      )}
      <MediaLibrary
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onSelect={(url) => addUrl(url)}
      />
    </div>
  );
}
