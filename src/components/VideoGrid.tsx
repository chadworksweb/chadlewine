"use client";

import { useState } from "react";
import Image from "next/image";

interface Category { id: string; title: string; slug: string; }
interface Video {
  id: string; title: string; slug: string; category_id: string | null;
  stream_id: string | null; embed_url: string | null;
  thumbnail_path: string | null; description: string | null;
  is_featured: boolean; duration_seconds: number | null;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoGrid({ categories, videos }: { categories: Category[]; videos: Video[] }) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeVideo, setActiveVideo] = useState<Video | null>(null);

  const featured = videos.filter((v) => v.is_featured);
  const filtered = activeCategory
    ? videos.filter((v) => v.category_id === activeCategory)
    : videos;

  function getEmbedSrc(video: Video): string | null {
    if (video.embed_url) return video.embed_url;
    if (video.stream_id) return `https://iframe.mediadelivery.net/embed/${video.stream_id}`;
    return null;
  }

  return (
    <div className="tvp">
      {/* Active video player */}
      {activeVideo && (
        <div className="tvp__player">
          {getEmbedSrc(activeVideo) ? (
            <iframe
              src={getEmbedSrc(activeVideo)!}
              className="tvp__iframe"
              allowFullScreen
              allow="autoplay; encrypted-media"
              title={activeVideo.title}
            />
          ) : (
            <div className="tvp__no-source">No video source available</div>
          )}
          <h2 className="tvp__active-title">{activeVideo.title}</h2>
          {activeVideo.description && (
            <p className="tvp__active-desc">{activeVideo.description}</p>
          )}
        </div>
      )}

      {/* Featured section */}
      {!activeVideo && featured.length > 0 && (
        <div className="tvp__featured">
          <h2 style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "var(--space-md)" }}>Featured</h2>
          <div className="tvp__grid">
            {featured.map((v) => (
              <button key={v.id} className="tvp__card" onClick={() => setActiveVideo(v)}>
                {v.thumbnail_path && <Image src={v.thumbnail_path} alt={v.title} className="tvp__thumb" width={800} height={450} sizes="(max-width: 720px) 50vw, 320px" loading="lazy" />}
                <span className="tvp__card-title">{v.title}</span>
                {v.duration_seconds && <span className="tvp__card-dur">{formatDuration(v.duration_seconds)}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Category filter */}
      {categories.length > 0 && (
        <div className="tvp__categories">
          <button
            className={`tvp__cat-btn${!activeCategory ? " tvp__cat-btn--active" : ""}`}
            onClick={() => setActiveCategory(null)}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              className={`tvp__cat-btn${activeCategory === c.id ? " tvp__cat-btn--active" : ""}`}
              onClick={() => setActiveCategory(c.id)}
            >
              {c.title}
            </button>
          ))}
        </div>
      )}

      {/* Video grid */}
      <div className="tvp__grid">
        {filtered.map((v) => (
          <button key={v.id} className="tvp__card" onClick={() => setActiveVideo(v)}>
            {v.thumbnail_path && <Image src={v.thumbnail_path} alt={v.title} className="tvp__thumb" width={800} height={450} sizes="(max-width: 720px) 50vw, 320px" loading="lazy" />}
            <span className="tvp__card-title">{v.title}</span>
            {v.duration_seconds && <span className="tvp__card-dur">{formatDuration(v.duration_seconds)}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
