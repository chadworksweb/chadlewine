"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { MiniPlayer } from "@/components/MiniPlayer";
import { VISIBILITY_CATEGORIES } from "@/lib/song-visibility";
import { CompassIcon } from "@/components/RCBadge";
import "./ArtDetail.css";
import { focalCropStyle } from "@/lib/focal-crop";

interface SongProps {
  id: string;
  title: string;
  slug: string;
  track_number: number;
  duration_seconds: number | null;
  streaming_path: string | null;
  lyrics: string | null;
  instrumental: boolean;
  price: number | null;
  release_date: string | null;
  song_summary: string | null;
  isrc: string | null;
  art_image_path: string | null;
  art_alt: string | null;
  card_focal_x?: number | null;
  card_focal_y?: number | null;
  card_zoom?: number | null;
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
  chad_quote: string | null;
}

interface BadgeProps {
  tier: string;
  tierLabel: string;
  tierHex: string;
  charge: number;
  chargeSummary: string | null;
  contaminated: boolean;
  contaminationNote: string | null;
  pending?: boolean;
  songSlug?: string | null;
}

interface PairedArtProps {
  id: string;
  slug: string;
  title: string;
  image_path: string;
  image_alt: string | null;
  hero_focal_x: number | null;
  hero_focal_y: number | null;
  hero_zoom: number | null;
  art_summary: string | null;
}

/** Strip the first h1/h2/h3 from rendered HTML — we provide our own section headings */
function stripLeadingHeading(html: string): string {
  return html.replace(/^\s*<h[1-3][^>]*>.*?<\/h[1-3]>\s*/i, "");
}

function formatPrice(dollars: number): string {
  return `$${Number(dollars).toFixed(2)}`;
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
  pairedArt = [],
  songFormats = [],
  albumFormats = [],
  merchSlot = null,
}: {
  song: SongProps;
  album: AlbumProps | null;
  totalTracks: number;
  expansions?: ExpansionProps[];
  visibilitySections?: VisibilitySectionProps[];
  badge?: BadgeProps | null;
  playbackMode?: "preview" | "full";
  songFormats?: Array<"mp3" | "flac" | "wav">;
  albumFormats?: Array<"mp3" | "flac" | "wav">;
  geoFields?: GeoFieldsProps | null;
  pairedArt?: PairedArtProps[];
  merchSlot?: React.ReactNode;
}) {
  const [lyricsExpanded, setLyricsExpanded] = useState(false);
  const [buying, setBuying] = useState<"song" | "album" | null>(null);
  const [openExpansions, setOpenExpansions] = useState<Set<string>>(new Set());
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [songFormat, setSongFormat] = useState<"mp3" | "flac" | "wav">(
    (songFormats[0] as "mp3" | "flac" | "wav") || "mp3"
  );
  const [albumFormat, setAlbumFormat] = useState<"mp3" | "flac" | "wav">(
    (albumFormats[0] as "mp3" | "flac" | "wav") || "mp3"
  );

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
        body: JSON.stringify({
          type,
          id: type === "song" ? song.id : album!.id,
          format: type === "song" ? songFormat : albumFormat,
        }),
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

  const infoCells: { key: string; label: string; value: React.ReactNode }[] = [];

  if (song.release_date) {
    const d = new Date(song.release_date);
    infoCells.push({
      key: "released",
      label: "Released",
      value: d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }),
    });
  }

  if (song.price) {
    infoCells.push({ key: "price", label: "Price", value: formatPrice(song.price) });
  }

  if (album) {
    infoCells.push({
      key: "track",
      label: "Track",
      value: `${song.track_number} of ${totalTracks}`,
    });

    infoCells.push({
      key: "album",
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
      key: "release",
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
              style={focalCropStyle(song.card_focal_x ?? null, song.card_focal_y ?? null, song.card_zoom ?? null)}
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
            {infoCells.map((cell) => (
              <div key={cell.key} className={`track-detail__info-cell track-detail__info-cell--${cell.key}`}>
                <span className={`track-detail__info-label track-detail__info-label--${cell.key}`}>{cell.label}</span>
                <span className={`track-detail__info-value track-detail__info-value--${cell.key}`}>{cell.value}</span>
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
                  Buy Album
                </Link>
              )}
              {song.price && songFormats.length > 0 && (
                <button
                  type="button"
                  className="track-detail__btn track-detail__btn--buy"
                  onClick={() => handleBuy("song")}
                  disabled={buying === "song"}
                >
                  {buying === "song" ? "..." : "Buy Song"}
                </button>
              )}
            </div>

            {badge && (
              <div className="track-detail__rc-badge">
                {badge.pending && (
                  <span
                    className="track-detail__rc-pending-stamp"
                    aria-label="Pending recalibration"
                    title="This score is being contested — a recalibration is pending review."
                  >
                    PENDING
                  </span>
                )}
                <a
                  href={badge.songSlug ? `https://risingcompass.net/songs/${encodeURIComponent(badge.songSlug)}` : "https://risingcompass.net"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="track-detail__rc-compass-link"
                >
                  <CompassIcon charge={badge.charge} tierHex={badge.tierHex} />
                </a>
                <div className="track-detail__rc-data">
                  <span className="track-detail__rc-tier" style={{ color: badge.tierHex }}>
                    {badge.tierLabel}
                  </span>
                  <div className="track-detail__rc-charge-row">
                    <span className="track-detail__rc-charge">
                      {badge.charge > 0 ? "+" : ""}{badge.charge}
                    </span>
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
                            <p className="track-detail__rc-summary-text">{badge.chargeSummary}</p>
                            {badge.contaminated && badge.contaminationNote && (
                              <p className="track-detail__rc-contam">{badge.contaminationNote}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Lyrics */}
          {song.instrumental ? (
            <div className="track-detail__section">
              <h3 className="track-detail__section-title">Lyrics</h3>
              <p style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>
                Instrumental — no lyrics.
              </p>
            </div>
          ) : song.lyrics && (
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

      {merchSlot && (
        <div className="song-landing__container">{merchSlot}</div>
      )}

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
        const syncPlacements = sectionMap.get("sync-placements");

        return (
          <div className="song-landing">
            {/* 1. What Is "[Title]"? — citation summary + entity tags + Chad quote */}
            {(geoFields?.citation_summary || geoFields?.chad_quote || (geoFields?.entity_tags && geoFields.entity_tags.length > 0)) && (
              <section className="song-landing__section song-landing__section--about">
                <div className="song-landing__container">
                  <h2 className="song-landing__heading">What is the song &ldquo;{song.title}&rdquo; by Chad Lewine about?</h2>
                  <div className="song-landing__layers">
                    {geoFields?.chad_quote && (
                      <blockquote className="song-landing__chad-quote">
                        <p>{geoFields.chad_quote}</p>
                        <cite>— Chad Lewine</cite>
                      </blockquote>
                    )}
                    {geoFields?.citation_summary && (
                      <p className="song-landing__direct-answer">{geoFields.citation_summary}</p>
                    )}
                    {geoFields?.entity_tags && geoFields.entity_tags.length > 0 && (
                      <div>
                        <h3 className="song-landing__column-heading">Topics &amp; themes</h3>
                        <ul className="song-landing__key-points">
                          {geoFields.entity_tags.filter((e) => e.trim()).map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* 2. If You Like — interception: seeker searched for a famous artist (format stack) */}
            {(ifYouLike?.directAnswer || ifYouLike?.contentHtml || (ifYouLike?.keyPoints && ifYouLike.keyPoints.length > 0)) && (
              <section className="song-landing__section song-landing__section--alt song-landing__section--audience">
                <div className="song-landing__container">
                  <aside className="song-landing__aside">
                    <h2 className="song-landing__heading">Fans of these songs might like &ldquo;{song.title}&rdquo;</h2>
                    {ifYouLike.directAnswer && (
                      <p className="song-landing__direct-answer">{ifYouLike.directAnswer}</p>
                    )}
                  </aside>
                  <div className="song-landing__main">
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
                </div>
              </section>
            )}

            {/* 3. Who This Song Is For — speaks to the seeker's emotional state (format stack) */}
            {(audience?.directAnswer || audience?.contentHtml || (audience?.keyPoints && audience.keyPoints.length > 0)) && (
              <section className="song-landing__section">
                <div className="song-landing__container">
                  <aside className="song-landing__aside">
                    <h2 className="song-landing__heading">Who Is &ldquo;{song.title}&rdquo; For?</h2>
                    {audience.directAnswer && (
                      <p className="song-landing__direct-answer">{audience.directAnswer}</p>
                    )}
                  </aside>
                  <div className="song-landing__main">
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
                </div>
              </section>
            )}

            {/* 4. Inside the Song — thematic universe (format stack) */}
            {(world?.directAnswer || world?.contentHtml || (world?.keyPoints && world.keyPoints.length > 0)) && (
              <section className="song-landing__section song-landing__section--alt">
                <div className="song-landing__container">
                  <aside className="song-landing__aside">
                    <h2 className="song-landing__heading">What Is &ldquo;{song.title}&rdquo; About?</h2>
                    {world.directAnswer && (
                      <p className="song-landing__direct-answer">{world.directAnswer}</p>
                    )}
                  </aside>
                  <div className="song-landing__main">
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
                </div>
              </section>
            )}

            {/* 5. Lines That Stay — quotable fragments, high extraction value (format stack) */}
            {(fragments?.directAnswer || fragments?.contentHtml || (fragments?.keyPoints && fragments.keyPoints.length > 0)) && (
              <section className="song-landing__section">
                <div className="song-landing__container">
                  <aside className="song-landing__aside">
                    <h2 className="song-landing__heading">What Are the Best Lines in &ldquo;{song.title}&rdquo;?</h2>
                    {fragments.directAnswer && (
                      <p className="song-landing__direct-answer">{fragments.directAnswer}</p>
                    )}
                  </aside>
                  <div className="song-landing__main">
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
                </div>
              </section>
            )}

            {/* 6. The Bigger Picture — cultural position (format stack) */}
            {(culturalPosition?.directAnswer || culturalPosition?.contentHtml || (culturalPosition?.keyPoints && culturalPosition.keyPoints.length > 0)) && (
              <section className="song-landing__section song-landing__section--alt">
                <div className="song-landing__container">
                  <aside className="song-landing__aside">
                    <h2 className="song-landing__heading">Where Does &ldquo;{song.title}&rdquo; Fit?</h2>
                    {culturalPosition.directAnswer && (
                      <p className="song-landing__direct-answer">{culturalPosition.directAnswer}</p>
                    )}
                  </aside>
                  <div className="song-landing__main">
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
                </div>
              </section>
            )}

            {/* 7. The Backstory — origin story, for the already-interested (format stack) */}
            {(story?.directAnswer || story?.contentHtml || (story?.keyPoints && story.keyPoints.length > 0)) && (
              <section className="song-landing__section">
                <div className="song-landing__container">
                  <aside className="song-landing__aside">
                    <h2 className="song-landing__heading">What Is the Story Behind &ldquo;{song.title}&rdquo;?</h2>
                    {story.directAnswer && (
                      <p className="song-landing__direct-answer">{story.directAnswer}</p>
                    )}
                  </aside>
                  <div className="song-landing__main">
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
                </div>
              </section>
            )}

            {/* 8. Behind the Music — craft & construction (format stack) */}
            {(breakdown?.directAnswer || breakdown?.contentHtml || (breakdown?.keyPoints && breakdown.keyPoints.length > 0)) && (
              <section className="song-landing__section song-landing__section--alt">
                <div className="song-landing__container">
                  <aside className="song-landing__aside">
                    <h2 className="song-landing__heading">What Makes &ldquo;{song.title}&rdquo; Work?</h2>
                    {breakdown.directAnswer && (
                      <p className="song-landing__direct-answer">{breakdown.directAnswer}</p>
                    )}
                  </aside>
                  <div className="song-landing__main">
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
                </div>
              </section>
            )}

            {/* 9. From the Same Universe — catalog cross-links (format stack) */}
            {(connections?.directAnswer || connections?.contentHtml || (connections?.keyPoints && connections.keyPoints.length > 0)) && (
              <section className="song-landing__section">
                <div className="song-landing__container">
                  <aside className="song-landing__aside">
                    <h2 className="song-landing__heading">What Other Songs Connect to &ldquo;{song.title}&rdquo;?</h2>
                    {connections.directAnswer && (
                      <p className="song-landing__direct-answer">{connections.directAnswer}</p>
                    )}
                  </aside>
                  <div className="song-landing__main">
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
                </div>
              </section>
            )}

            {/* 10. Sync Placements — GEO: where this song fits in film/TV/ads (format stack) */}
            {(syncPlacements?.directAnswer || syncPlacements?.contentHtml || (syncPlacements?.keyPoints && syncPlacements.keyPoints.length > 0)) && (
              <section className="song-landing__section song-landing__section--alt">
                <div className="song-landing__container">
                  <aside className="song-landing__aside">
                    <h2 className="song-landing__heading">Where Could &ldquo;{song.title}&rdquo; Be Placed?</h2>
                    {syncPlacements.directAnswer && (
                      <p className="song-landing__direct-answer">{syncPlacements.directAnswer}</p>
                    )}
                  </aside>
                  <div className="song-landing__main">
                    {syncPlacements.contentHtml && (
                      <div
                        className="song-landing__prose reading-column"
                        dangerouslySetInnerHTML={{ __html: stripLeadingHeading(syncPlacements.contentHtml) }}
                      />
                    )}
                    {syncPlacements.keyPoints && syncPlacements.keyPoints.length > 0 && (
                      <ul className="song-landing__key-points">
                        {syncPlacements.keyPoints.map((pt, i) => (
                          <li key={i}>{pt}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* 11. People Also Ask — FAQ section */}
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

            {/* Art you might like — cross-sell */}
            {pairedArt.length > 0 && (
              <section className="song-landing__section">
                <div className="song-landing__container">
                  <h2 className="song-landing__heading">Art you might like</h2>
                  <div className="art-detail__pairings-grid art-detail__pairings-grid--hero">
                    {pairedArt.map((a) => (
                      <Link key={a.id} href={`/art/${a.slug}`} className="art-pairing-card art-pairing-card--hero">
                        <Image
                          src={a.image_path}
                          alt={a.image_alt || a.title}
                          className="art-pairing-card__img"
                          width={1200}
                          height={1200}
                          sizes="(max-width: 720px) 100vw, 600px"
                          style={focalCropStyle(a.hero_focal_x, a.hero_focal_y, a.hero_zoom)}
                        />
                        <div className="art-pairing-card__body">
                          <h3 className="art-pairing-card__title">{a.title}</h3>
                          {a.art_summary && <p className="art-pairing-card__summary">{a.art_summary}</p>}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Business Inquiries CTA */}
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
