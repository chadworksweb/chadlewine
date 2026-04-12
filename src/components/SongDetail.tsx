"use client";

import { useState } from "react";
import Link from "next/link";
import { MiniPlayer } from "@/components/MiniPlayer";
import { VISIBILITY_CATEGORIES } from "@/lib/song-visibility";

interface SongProps {
  id: string;
  title: string;
  slug: string;
  track_number: number;
  duration_seconds: number | null;
  streaming_path: string | null;
  lyrics: string | null;
  price: number | null;
  release_date: string | null;
  song_summary: string | null;
  isrc: string | null;
  art_image_path: string | null;
  art_alt: string | null;
}

interface AlbumProps {
  id: string;
  title: string;
  slug: string;
  cover_art_path: string | null;
  cover_art_alt: string | null;
  price: number | null;
}

interface ExpansionProps {
  id: string;
  title: string;
  slug: string;
  body: string;
}

interface VisibilitySectionProps {
  id: string;
  category: string;
  content: string;
  contentHtml: string;
}

interface BadgeProps {
  tier: string;
  tierLabel: string;
  tierHex: string;
  charge: number;
  chargeSummary: string | null;
  contaminated: boolean;
  contaminationNote: string | null;
}

function formatPrice(dollars: number): string {
  return `$${Number(dollars).toFixed(2)}`;
}

/** Convert charge (-100 to +100) to needle rotation in degrees.
 *  The gauge spans 180° (left=Ascended to right=Corrupted).
 *  Needle at 0° = straight up = Decent (charge 0).
 *  Charge +100 → -90° (full left, violet arc).
 *  Charge -100 → +90° (full right, red arc).
 *  The Rising Compass degree formula: degree = 90 - (charge * 0.9)
 *  So for the SVG needle rotation from center: rotation = -(charge * 0.9)  */
function chargeToNeedleAngle(charge: number): number {
  // Needle starts pointing straight up (12 o'clock).
  // Positive charge → rotate left (counter-clockwise = negative in SVG).
  // Negative charge → rotate right (clockwise = positive in SVG).
  // +100 should reach far-left arc (violet) = -90° rotation.
  // -100 should reach far-right arc (red) = +90° rotation.
  // Linear map: angle = -(charge / 100) * 90
  // But the gauge only spans ~80° each side visually due to arc geometry,
  // so scale down to prevent overshoot.
  const clamped = Math.max(-100, Math.min(100, charge));
  return -(clamped / 100) * 58;
}

function CompassIcon({ charge, tierHex }: { charge: number; tierHex: string }) {
  const angle = chargeToNeedleAngle(charge);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 32 32" className="rc-compass-icon">
      {/* Background */}
      <rect width="32" height="32" rx="6" fill="#0a0a14"/>
      {/* 5-color gauge arc */}
      <path d="M 5,20 A 11,11 0 0,1 7.6,13.1" fill="none" stroke="#9933ff" strokeWidth="6" strokeLinecap="butt"/>
      <path d="M 7.6,13.1 A 11,11 0 0,1 12.6,9.6" fill="none" stroke="#3388ff" strokeWidth="6" strokeLinecap="butt"/>
      <path d="M 12.6,9.6 A 11,11 0 0,1 19.4,9.6" fill="none" stroke="#33cc55" strokeWidth="6" strokeLinecap="butt"/>
      <path d="M 19.4,9.6 A 11,11 0 0,1 24.4,13.1" fill="none" stroke="#ffbb33" strokeWidth="6" strokeLinecap="butt"/>
      <path d="M 24.4,13.1 A 11,11 0 0,1 27,20" fill="none" stroke="#ff3333" strokeWidth="6" strokeLinecap="butt"/>
      {/* Needle — rotated based on charge */}
      <g transform={`rotate(${angle}, 16, 20)`}>
        <polygon points="16,10 14.2,20 17.8,20" fill="#eeeef4"/>
      </g>
      {/* Needle cap — colored to match tier */}
      <circle cx="16" cy="20" r="3" fill={tierHex}/>
    </svg>
  );
}

export function SongDetail({
  song,
  album,
  totalTracks,
  expansions = [],
  visibilitySections = [],
  composition = null,
  badge,
  playbackMode = "preview",
}: {
  song: SongProps;
  album: AlbumProps | null;
  totalTracks: number;
  expansions?: ExpansionProps[];
  visibilitySections?: VisibilitySectionProps[];
  composition?: { contentHtml: string } | null;
  badge?: BadgeProps | null;
  playbackMode?: "preview" | "full";
}) {
  const [lyricsExpanded, setLyricsExpanded] = useState(false);
  const [buying, setBuying] = useState<"song" | "album" | null>(null);
  const [openExpansions, setOpenExpansions] = useState<Set<string>>(new Set());
  const [summaryOpen, setSummaryOpen] = useState(false);

  function toggleExpansion(id: string) {
    setOpenExpansions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBuy(type: "song" | "album") {
    if (type === "album" && !album) return;
    setBuying(type);
    try {
      const res = await fetch("/api/music-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id: type === "song" ? song.id : album!.id }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setBuying(null);
    }
  }

  // Resolve cover art: song art overrides album art; fall back to album art if song has none
  const coverArtPath = song.art_image_path || album?.cover_art_path || null;
  const coverArtAlt = song.art_alt || album?.cover_art_alt || album?.title || song.title;

  const infoCells: { label: string; value: React.ReactNode }[] = [];

  if (song.price) {
    infoCells.push({ label: "Price", value: formatPrice(song.price) });
  }

  if (album) {
    infoCells.push({
      label: "Track",
      value: `${song.track_number} of ${totalTracks}`,
    });

    infoCells.push({
      label: "Album",
      value: (
        <Link
          href="/discography"
          className="track-detail__glitch-link"
          data-text={album.title}
        >
          {album.title}
        </Link>
      ),
    });
  } else {
    infoCells.push({
      label: "Release",
      value: "Single",
    });
  }

  return (
    <div className="track-detail">
      <div className="track-detail__grid">
        {/* Left column — Cover art (song art overrides album art) */}
        <div className="track-detail__art-col">
          {coverArtPath && (
            <img
              src={coverArtPath}
              alt={coverArtAlt}
              className="track-detail__cover"
              loading="eager"
            />
          )}
        </div>

        {/* Right column — Content */}
        <div className="track-detail__content-col">
          <h1 className="track-detail__title">{song.title}</h1>

          {/* Info bar */}
          <div
            className="track-detail__info-bar"
            data-cols={infoCells.length}
          >
            {infoCells.map((cell, i) => (
              <div key={i} className="track-detail__info-cell">
                <span className="track-detail__info-label">{cell.label}</span>
                <span className="track-detail__info-value">{cell.value}</span>
              </div>
            ))}
          </div>

          {/* Mini player */}
          {song.streaming_path && song.duration_seconds && (
            <MiniPlayer
              streamingUrl={song.streaming_path}
              trackNumber={song.track_number}
              trackTitle={song.title}
              durationSeconds={song.duration_seconds}
              playbackMode={playbackMode}
            />
          )}

          {/* Action row: buttons + badge */}
          <div className="track-detail__action-row">
            <div className="track-detail__actions">
              {album && (
                <Link href={`/music/albums/${album.slug}`} className="track-detail__btn track-detail__btn--buy-album">
                  Buy Album{album.price ? ` — ${formatPrice(album.price)}` : ""}
                </Link>
              )}
              {song.price && (
                <button
                  type="button"
                  className="track-detail__btn track-detail__btn--buy"
                  onClick={() => handleBuy("song")}
                  disabled={buying === "song"}
                >
                  {buying === "song" ? "..." : `Buy Song — ${formatPrice(song.price)}`}
                </button>
              )}
            </div>

            {badge && (
              <div className="track-detail__rc-badge">
                <a href="https://risingcompass.net" target="_blank" rel="noopener noreferrer" className="track-detail__rc-compass-link">
                  <CompassIcon charge={badge.charge} tierHex={badge.tierHex} />
                </a>
                <div className="track-detail__rc-data">
                  <span className="track-detail__rc-tier" style={{ color: badge.tierHex }}>
                    {badge.tierLabel}
                  </span>
                  <span className="track-detail__rc-charge">
                    {badge.charge > 0 ? "+" : ""}{badge.charge}
                  </span>
                </div>
                {badge.chargeSummary && (
                  <div className="track-detail__rc-summary-wrap">
                    <button
                      type="button"
                      className="track-detail__rc-summary-btn"
                      onClick={() => setSummaryOpen((v) => !v)}
                      aria-label="Read charge summary"
                      title="Charge summary"
                    >
                      &#x1F4AC;
                    </button>
                    {summaryOpen && (
                      <div className="track-detail__rc-summary-tooltip">
                        <p>{badge.chargeSummary}</p>
                        {badge.contaminated && badge.contaminationNote && (
                          <p className="track-detail__rc-contam">{badge.contaminationNote}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Lyrics */}
          {song.lyrics && (
            <div className="track-detail__section">
              <h3 className="track-detail__section-title">Lyrics</h3>
              <div
                className={`track-detail__lyrics ${lyricsExpanded ? "track-detail__lyrics--expanded" : ""}`}
              >
                <pre className="track-detail__lyrics-text">{song.lyrics.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\n")}</pre>
              </div>
              <button
                type="button"
                className="track-detail__lyrics-toggle"
                onClick={() => setLyricsExpanded((v) => !v)}
              >
                {lyricsExpanded ? "Show less" : "Show full lyrics"}
              </button>
            </div>
          )}

          {/* Song Summary */}
          {song.song_summary && (
            <div className="track-detail__section">
              <h3 className="track-detail__section-title">About This Song</h3>
              <div className="track-detail__summary-text">
                {song.song_summary}
              </div>
            </div>
          )}

          {/* Expansions */}
          {expansions.length > 0 && (
            <div className="track-detail__section">
              <h3 className="track-detail__section-title">Deep Dive</h3>
              <div className="track-detail__expansions">
                {expansions.map((exp) => (
                  <div key={exp.id} className="track-detail__expansion">
                    <button
                      type="button"
                      className="track-detail__expansion-toggle"
                      onClick={() => toggleExpansion(exp.id)}
                      aria-expanded={openExpansions.has(exp.id)}
                    >
                      <span className="track-detail__expansion-arrow">
                        {openExpansions.has(exp.id) ? "▾" : "▸"}
                      </span>
                      {exp.title}
                    </button>
                    {openExpansions.has(exp.id) && (
                      <div className="track-detail__expansion-body">
                        {exp.body.split("\n\n").map((paragraph, i) => (
                          <p key={i}>{paragraph}</p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Composition — unified published piece */}
      {composition && composition.contentHtml && (
        <div className="track-visibility">
          <div className="track-visibility__rule" />
          <div className="track-visibility__block track-visibility__block--composition">
            <div className="track-visibility__block-inner" style={{ gridTemplateColumns: "1fr" }}>
              <div
                className="track-visibility__content-col track-visibility__content--composition reading-column"
                style={{ maxWidth: "800px" }}
                dangerouslySetInnerHTML={{ __html: composition.contentHtml }}
              />
            </div>
          </div>
          <div className="track-visibility__business">
            <span className="track-visibility__business-text">
              Interested in licensing, sync placement, or collaboration?
            </span>
            <Link href="/business" className="track-visibility__business-link">
              Business Inquiries
            </Link>
          </div>
        </div>
      )}

      {/* Visibility fallback — raw sections when no composition */}
      {!composition && visibilitySections.length > 0 && (
        <div className="track-visibility">
          <div className="track-visibility__rule" />

          {visibilitySections.map((section, idx) => {
            const cat = VISIBILITY_CATEGORIES.find((c) => c.slug === section.category);
            if (!cat || !section.contentHtml) return null;

            const isWide = ["hooks", "fragments", "connections"].includes(section.category);

            return (
              <section
                key={section.id}
                className={`track-visibility__block track-visibility__block--${section.category}${isWide ? " track-visibility__block--wide" : ""}${idx % 2 === 1 ? " track-visibility__block--alt" : ""}`}
              >
                <div className="track-visibility__block-inner">
                  <div className="track-visibility__label-col">
                    <span className="track-visibility__category-tag">{cat.label}</span>
                    <span className="track-visibility__category-desc">{cat.description}</span>
                  </div>
                  <div
                    className={`track-visibility__content-col track-visibility__content--${section.category} reading-column`}
                    dangerouslySetInnerHTML={{ __html: section.contentHtml }}
                  />
                </div>
                <div className={`track-visibility__media-slot track-visibility__media--${section.category}`} />
              </section>
            );
          })}

          <div className="track-visibility__business">
            <span className="track-visibility__business-text">
              Interested in licensing, sync placement, or collaboration?
            </span>
            <Link href="/business" className="track-visibility__business-link">
              Business Inquiries
            </Link>
          </div>
        </div>
      )}

      {!composition && visibilitySections.length === 0 && (
        <div className="track-detail__business-cta" style={{ maxWidth: "800px", margin: "0 auto" }}>
          Interested in licensing or sync placement? <Link href="/business">Business inquiries</Link>
        </div>
      )}
    </div>
  );
}
