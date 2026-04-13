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
  directAnswer: string | null;
  keyPoints: string[];
}

interface GeoFieldsProps {
  citation_summary: string | null;
  focus_keyphrase: string | null;
  secondary_keyphrases: string[];
  paa_pairs: { question: string; answer: string }[];
  entity_tags: string[];
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

/** Strip the first h1/h2/h3 from rendered HTML — we provide our own section headings */
function stripLeadingHeading(html: string): string {
  return html.replace(/^\s*<h[1-3][^>]*>.*?<\/h[1-3]>\s*/i, "");
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
  badge,
  playbackMode = "preview",
  geoFields = null,
}: {
  song: SongProps;
  album: AlbumProps | null;
  totalTracks: number;
  expansions?: ExpansionProps[];
  visibilitySections?: VisibilitySectionProps[];
  badge?: BadgeProps | null;
  playbackMode?: "preview" | "full";
  geoFields?: GeoFieldsProps | null;
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

  if (song.release_date) {
    const d = new Date(song.release_date);
    infoCells.push({
      label: "Released",
      value: d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }),
    });
  }

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

      {/* ═══ SONG LANDING PAGE — FORMAT STACK ═══
           Each section contains up to three extraction layers:
           1. direct-answer <p> — standalone extractable block (Perplexity, Gemini AI Overview)
           2. prose <div> — citation-worthy narrative depth (ChatGPT, all engines)
           3. key-points <ul> — structured extraction (Perplexity, Gemini)
           Plus FAQPage schema in JSON-LD for machine-readable (Google AI Overview) */}
      {(visibilitySections.length > 0 || geoFields) && (() => {
        const sectionMap = new Map(visibilitySections.map((s) => [s.category, s]));
        const story = sectionMap.get("story");
        const breakdown = sectionMap.get("breakdown");
        const world = sectionMap.get("world");
        const audience = sectionMap.get("audience");
        const fragments = sectionMap.get("fragments");
        const connections = sectionMap.get("connections");
        const culturalPosition = sectionMap.get("cultural-position");
        const ifYouLike = sectionMap.get("if-you-like");

        return (
          <div className="song-landing">
            <div className="song-landing__rule" />

            {/* 1. What Is "[Title]"? — citation summary + entity tags */}
            {geoFields?.citation_summary && (
              <section className="song-landing__section">
                <div className="song-landing__container">
                  <h2 className="song-landing__heading">What Is &ldquo;{song.title}&rdquo;?</h2>
                  <p className="song-landing__direct-answer">{geoFields.citation_summary}</p>
                  {geoFields.entity_tags.length > 0 && (
                    <ul className="song-landing__key-points">
                      {geoFields.entity_tags.filter((e) => e.trim()).map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

            {/* 2. If You Like — interception: seeker searched for a famous artist (format stack) */}
            {(ifYouLike?.directAnswer || ifYouLike?.contentHtml || (ifYouLike?.keyPoints && ifYouLike.keyPoints.length > 0)) && (
              <section className="song-landing__section song-landing__section--alt">
                <div className="song-landing__container">
                  <h2 className="song-landing__heading">Who Should Listen to &ldquo;{song.title}&rdquo;?</h2>
                  {ifYouLike.directAnswer && (
                    <p className="song-landing__direct-answer">{ifYouLike.directAnswer}</p>
                  )}
                  {ifYouLike.contentHtml && (
                    <div
                      className="song-landing__prose reading-column"
                      dangerouslySetInnerHTML={{ __html: stripLeadingHeading(ifYouLike.contentHtml) }}
                    />
                  )}
                  {ifYouLike.keyPoints && ifYouLike.keyPoints.length > 0 && (
                    <ul className="song-landing__key-points">
                      {ifYouLike.keyPoints.map((pt, i) => (
                        <li key={i}>{pt}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

            {/* 3. Who This Song Is For — speaks to the seeker's emotional state (format stack) */}
            {(audience?.directAnswer || audience?.contentHtml || (audience?.keyPoints && audience.keyPoints.length > 0)) && (
              <section className="song-landing__section">
                <div className="song-landing__container">
                  <h2 className="song-landing__heading">Who Is &ldquo;{song.title}&rdquo; For?</h2>
                  {audience.directAnswer && (
                    <p className="song-landing__direct-answer">{audience.directAnswer}</p>
                  )}
                  {audience.contentHtml && (
                    <div
                      className="song-landing__prose reading-column"
                      dangerouslySetInnerHTML={{ __html: stripLeadingHeading(audience.contentHtml) }}
                    />
                  )}
                  {audience.keyPoints && audience.keyPoints.length > 0 && (
                    <ul className="song-landing__key-points">
                      {audience.keyPoints.map((pt, i) => (
                        <li key={i}>{pt}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

            {/* 4. Inside the Song — thematic universe (format stack) */}
            {(world?.directAnswer || world?.contentHtml || (world?.keyPoints && world.keyPoints.length > 0)) && (
              <section className="song-landing__section song-landing__section--alt">
                <div className="song-landing__container">
                  <h2 className="song-landing__heading">What Is &ldquo;{song.title}&rdquo; About?</h2>
                  {world.directAnswer && (
                    <p className="song-landing__direct-answer">{world.directAnswer}</p>
                  )}
                  {world.contentHtml && (
                    <div
                      className="song-landing__prose reading-column"
                      dangerouslySetInnerHTML={{ __html: stripLeadingHeading(world.contentHtml) }}
                    />
                  )}
                  {world.keyPoints && world.keyPoints.length > 0 && (
                    <ul className="song-landing__key-points">
                      {world.keyPoints.map((pt, i) => (
                        <li key={i}>{pt}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

            {/* 5. Lines That Stay — quotable fragments, high extraction value (format stack) */}
            {(fragments?.directAnswer || fragments?.contentHtml || (fragments?.keyPoints && fragments.keyPoints.length > 0)) && (
              <section className="song-landing__section">
                <div className="song-landing__container">
                  <h2 className="song-landing__heading">What Are the Best Lines in &ldquo;{song.title}&rdquo;?</h2>
                  {fragments.directAnswer && (
                    <p className="song-landing__direct-answer">{fragments.directAnswer}</p>
                  )}
                  {fragments.contentHtml && (
                    <div
                      className="song-landing__prose song-landing__prose--fragments reading-column"
                      dangerouslySetInnerHTML={{ __html: stripLeadingHeading(fragments.contentHtml) }}
                    />
                  )}
                  {fragments.keyPoints && fragments.keyPoints.length > 0 && (
                    <ul className="song-landing__key-points">
                      {fragments.keyPoints.map((pt, i) => (
                        <li key={i}>{pt}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

            {/* 6. The Bigger Picture — cultural position (format stack) */}
            {(culturalPosition?.directAnswer || culturalPosition?.contentHtml || (culturalPosition?.keyPoints && culturalPosition.keyPoints.length > 0)) && (
              <section className="song-landing__section song-landing__section--alt">
                <div className="song-landing__container">
                  <h2 className="song-landing__heading">Where Does &ldquo;{song.title}&rdquo; Fit?</h2>
                  {culturalPosition.directAnswer && (
                    <p className="song-landing__direct-answer">{culturalPosition.directAnswer}</p>
                  )}
                  {culturalPosition.contentHtml && (
                    <div
                      className="song-landing__prose reading-column"
                      dangerouslySetInnerHTML={{ __html: stripLeadingHeading(culturalPosition.contentHtml) }}
                    />
                  )}
                  {culturalPosition.keyPoints && culturalPosition.keyPoints.length > 0 && (
                    <ul className="song-landing__key-points">
                      {culturalPosition.keyPoints.map((pt, i) => (
                        <li key={i}>{pt}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

            {/* 7. The Backstory — origin story, for the already-interested (format stack) */}
            {(story?.directAnswer || story?.contentHtml || (story?.keyPoints && story.keyPoints.length > 0)) && (
              <section className="song-landing__section">
                <div className="song-landing__container">
                  <h2 className="song-landing__heading">What Is the Story Behind &ldquo;{song.title}&rdquo;?</h2>
                  {story.directAnswer && (
                    <p className="song-landing__direct-answer">{story.directAnswer}</p>
                  )}
                  {story.contentHtml && (
                    <div
                      className="song-landing__prose reading-column"
                      dangerouslySetInnerHTML={{ __html: stripLeadingHeading(story.contentHtml) }}
                    />
                  )}
                  {story.keyPoints && story.keyPoints.length > 0 && (
                    <ul className="song-landing__key-points">
                      {story.keyPoints.map((pt, i) => (
                        <li key={i}>{pt}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

            {/* 8. Behind the Music — craft & construction (format stack) */}
            {(breakdown?.directAnswer || breakdown?.contentHtml || (breakdown?.keyPoints && breakdown.keyPoints.length > 0)) && (
              <section className="song-landing__section song-landing__section--alt">
                <div className="song-landing__container">
                  <h2 className="song-landing__heading">What Makes &ldquo;{song.title}&rdquo; Work?</h2>
                  {breakdown.directAnswer && (
                    <p className="song-landing__direct-answer">{breakdown.directAnswer}</p>
                  )}
                  {breakdown.contentHtml && (
                    <div
                      className="song-landing__prose reading-column"
                      dangerouslySetInnerHTML={{ __html: stripLeadingHeading(breakdown.contentHtml) }}
                    />
                  )}
                  {breakdown.keyPoints && breakdown.keyPoints.length > 0 && (
                    <ul className="song-landing__key-points">
                      {breakdown.keyPoints.map((pt, i) => (
                        <li key={i}>{pt}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

            {/* 9. From the Same Universe — catalog cross-links (format stack) */}
            {(connections?.directAnswer || connections?.contentHtml || (connections?.keyPoints && connections.keyPoints.length > 0)) && (
              <section className="song-landing__section">
                <div className="song-landing__container">
                  <h2 className="song-landing__heading">What Other Songs Connect to &ldquo;{song.title}&rdquo;?</h2>
                  {connections.directAnswer && (
                    <p className="song-landing__direct-answer">{connections.directAnswer}</p>
                  )}
                  {connections.contentHtml && (
                    <div
                      className="song-landing__prose reading-column"
                      dangerouslySetInnerHTML={{ __html: stripLeadingHeading(connections.contentHtml) }}
                    />
                  )}
                  {connections.keyPoints && connections.keyPoints.length > 0 && (
                    <ul className="song-landing__key-points">
                      {connections.keyPoints.map((pt, i) => (
                        <li key={i}>{pt}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

            {/* 10. People Also Ask — FAQ section */}
            {geoFields?.paa_pairs && geoFields.paa_pairs.length > 0 && (
              <section className="song-landing__section">
                <div className="song-landing__container">
                  <h2 className="song-landing__heading">People Also Ask</h2>
                  <dl className="song-landing__faq">
                    {geoFields.paa_pairs.map((p, i) => (
                      <div key={i} className="song-landing__faq-item">
                        <dt>{p.question}</dt>
                        <dd>{p.answer}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </section>
            )}

            {/* 12. If You Like — famous artists/songs (format stack) */}
            {(ifYouLike?.directAnswer || ifYouLike?.contentHtml || (ifYouLike?.keyPoints && ifYouLike.keyPoints.length > 0)) && (
              <section className="song-landing__section song-landing__section--alt">
                <div className="song-landing__container">
                  <h2 className="song-landing__heading">Who Should Listen to &ldquo;{song.title}&rdquo;?</h2>
                  {ifYouLike.directAnswer && (
                    <p className="song-landing__direct-answer">{ifYouLike.directAnswer}</p>
                  )}
                  {ifYouLike.contentHtml && (
                    <div
                      className="song-landing__prose reading-column"
                      dangerouslySetInnerHTML={{ __html: stripLeadingHeading(ifYouLike.contentHtml) }}
                    />
                  )}
                  {ifYouLike.keyPoints && ifYouLike.keyPoints.length > 0 && (
                    <ul className="song-landing__key-points">
                      {ifYouLike.keyPoints.map((pt, i) => (
                        <li key={i}>{pt}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

            {/* 13. Business Inquiries CTA */}
            <div className="song-landing__cta">
              <span className="song-landing__cta-text">
                Interested in licensing, sync placement, or collaboration?
              </span>
              <Link href="/business" className="song-landing__cta-link">
                Business Inquiries
              </Link>
            </div>
          </div>
        );
      })()}

      {/* Bare minimum CTA when no content exists */}
      {visibilitySections.length === 0 && !geoFields && (
        <div className="track-detail__business-cta" style={{ maxWidth: "800px", margin: "0 auto" }}>
          Interested in licensing or sync placement? <Link href="/business">Business inquiries</Link>
        </div>
      )}
    </div>
  );
}
