"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { MiniPlayer } from "@/components/MiniPlayer";
import { CubeVisualizer } from "@/components/CubeVisualizer";
import { CompassIcon } from "@/components/RCBadge";
import { useCart } from "@/components/Cart";
import { FormatShowcase, type FormatShowcaseSku } from "@/components/FormatShowcase";
import "./ArtDetail.css";
import { focalCropStyle } from "@/lib/focal-crop";
import { ExploreGrid } from "@/components/ExploreGrid";
import { FitText } from "@/components/FitText";
import { creditRoleLabel } from "@/lib/song-credits";

interface SongProps {
  id: string;
  title: string;
  slug: string;
  track_number: number;
  duration_seconds: number | null;
  streaming_path: string | null;
  lyrics: string | null;
  instrumental: boolean;
  release_date: string | null;
  song_summary: string | null;
  isrc: string | null;
  art_image_path: string | null;
  art_alt: string | null;
  card_focal_x?: number | null;
  card_focal_y?: number | null;
  card_zoom?: number | null;
  ringtone_price?: number | null;
  ringtone_available?: boolean;
  /** Precomputed beat timestamps (seconds) from scripts/analyze_beats.py.
   *  Visualizer fires morphs on these timestamps; falls back to live FFT
   *  detection when null/empty. */
  beat_peaks?: number[] | null;
  /** Per-beat full-band onset strength, 0..1 normalized, aligned with beat_peaks. */
  beat_strengths?: number[] | null;
  /** Per-beat kick-band (20-160 Hz) energy, 0..1 normalized, aligned with beat_peaks.
   *  Visualizer skips non-kick beats and scales morph intensity by this value. */
  beat_kicks?: number[] | null;
  /** Per-beat snare-band (200-450 Hz) energy, 0..1 normalized, aligned with beat_peaks.
   *  Drives the corner-strobe effect (airplane wingtip light on snare hits). */
  beat_snares?: number[] | null;
  /** Multi-stem hit data from analyze_drums_stems.py. Sparse jsonb array
   *  of { at, k?, s?, h?, to?, bp?, bs? } per hit. Takes priority over
   *  the librosa columns above when present. */
  beat_data?: BeatDataEvent[] | null;
  /** Seconds to add to every beat_data event time at playback (alignment
   *  nudge between stem-export timeline and the published MP3). */
  beat_offset_seconds?: number | null;
  /** Continuous RMS envelope of the bass-synth stem, 0..1 normalized.
   *  Sampled at bass_synth_envelope_hz; drives the ambient swell
   *  continuously rather than on discrete attacks. */
  bass_synth_envelope?: number[] | null;
  /** Sample rate (Hz) of bass_synth_envelope. index = floor(t * hz). */
  bass_synth_envelope_hz?: number | null;
  /** Per-frame pitch of the bass-synth stem, normalized 0..1 over the
   *  song's own MIDI range. Same sample rate + length as envelope.
   *  Drives ambient/glow hue rotation per note. */
  bass_synth_pitch?: number[] | null;
}

type BeatDataEvent = {
  at: number;
  k?: number; s?: number; h?: number; to?: number; bp?: number; bs?: number;
};

interface AlbumProps {
  id: string;
  title: string;
  slug: string;
  cover_art_path: string | null;
  cover_art_alt: string | null;
  release_date: string | null;
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
  /** Pre-rendered HTML for each key point. Bind with dangerouslySetInnerHTML
   *  on the <li> — never as plain text. The Html suffix is the contract. */
  keyPointsHtml: string[];
}

interface CreditProps {
  id: string;
  role: string;
  name: string;
}

interface ConnectionsSongProps {
  id: string;
  slug: string;
  title: string;
  art_image_path: string | null;
  art_alt: string | null;
}

interface GeoFieldsProps {
  citation_summary: string | null;
  focus_keyphrase: string | null;
  secondary_keyphrases: string[];
  paa_pairs: { question: string; answer: string }[];
  entity_tags: string[];
  chad_quote: string | null;
}

interface IfYouLikeEntry {
  artist: string;
  title: string;
  reason: string;
}

interface IfYouLikeProps {
  blurb: string | null;
  entries: IfYouLikeEntry[];
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


export function SongDetail({
  song,
  album,
  totalTracks,
  expansions = [],
  credits = [],
  visibilitySections = [],
  badge,
  playbackMode = "preview",
  geoFields = null,
  ifYouLike = null,
  pairedArt = [],
  connectionsSongs = [],
  songSkus = [],
  releaseSkus = [],
  merchSlot = null,
  renderConfig = null,
}: {
  song: SongProps;
  album: AlbumProps | null;
  totalTracks: number;
  expansions?: ExpansionProps[];
  credits?: CreditProps[];
  visibilitySections?: VisibilitySectionProps[];
  badge?: BadgeProps | null;
  playbackMode?: "preview" | "full";
  songSkus?: FormatShowcaseSku[];
  releaseSkus?: FormatShowcaseSku[];
  geoFields?: GeoFieldsProps | null;
  ifYouLike?: IfYouLikeProps | null;
  pairedArt?: PairedArtProps[];
  connectionsSongs?: ConnectionsSongProps[];
  merchSlot?: React.ReactNode;
  /** Effective render-lever config for the cube (see librosa-levers.ts). */
  renderConfig?: Record<string, number> | null;
}) {
  const [lyricsExpanded, setLyricsExpanded] = useState(false);
  const [openExpansions, setOpenExpansions] = useState<Set<string>>(new Set());
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [albumFormatsOpen, setAlbumFormatsOpen] = useState(false);
  const cart = useCart();
  const ringtoneInCart = cart.hasItem({ type: "ringtone", id: song.id, format: null });
  const ringtoneAvailable = !!song.ringtone_available && !!song.ringtone_price;

  function toggleExpansion(id: string) {
    setOpenExpansions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Resolve cover art: song art overrides album art; fall back to album art if song has none
  const coverArtPath = song.art_image_path || album?.cover_art_path || null;
  const coverArtAlt = song.art_alt || album?.cover_art_alt || album?.title || song.title;

  const infoCells: { key: string; label: string; value: React.ReactNode }[] = [];

  const effectiveReleaseDate = song.release_date ?? album?.release_date ?? null;
  if (effectiveReleaseDate) {
    const d = new Date(effectiveReleaseDate);
    infoCells.push({
      key: "released",
      label: "Released",
      value: d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }),
    });
  }

  // Price intentionally not shown — surfaces only at cart.

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
        <FitText sizesRem={[0.95625]}>
          <Link
            href={`/music/releases/${album.slug}`}
            className="track-detail__glitch-link"
            data-text={album.title}
          >
            {album.title}
          </Link>
        </FitText>
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
        {/* Left column — immersive cube visualizer. Replaces the static cover;
            still uses the cover art for cube faces + as the color source for
            the ambient background. Mirrored EQ bar reads audio while playing. */}
        <div className="track-detail__art-col">
          <CubeVisualizer
            songId={song.id}
            coverArtPath={coverArtPath}
            coverArtAlt={coverArtAlt}
            cardFocalX={song.card_focal_x ?? null}
            cardFocalY={song.card_focal_y ?? null}
            cardZoom={song.card_zoom ?? null}
            beatPeaks={song.beat_peaks ?? null}
            beatStrengths={song.beat_strengths ?? null}
            beatKicks={song.beat_kicks ?? null}
            beatSnares={song.beat_snares ?? null}
            beatData={song.beat_data ?? null}
            beatOffset={song.beat_offset_seconds ?? null}
            bassSynthEnvelope={song.bass_synth_envelope ?? null}
            bassSynthEnvelopeHz={song.bass_synth_envelope_hz ?? null}
            bassSynthPitch={song.bass_synth_pitch ?? null}
            renderConfig={renderConfig}
          />
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

          {/* Mini player + Rising Compass badge (badge sits to the right,
              shrinking the player to fit) */}
          {(song.streaming_path || badge) && (
            <div className="track-detail__player-row">
              {song.streaming_path && (
                <MiniPlayer
                  songId={song.id}
                  songSlug={song.slug}
                  streamingUrl={song.streaming_path}
                  trackNumber={song.track_number}
                  trackTitle={song.title}
                  durationSeconds={song.duration_seconds ?? 0}
                  artImagePath={coverArtPath}
                  artAlt={coverArtAlt}
                  playbackMode={playbackMode}
                  hideTitle
                />
              )}
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
          )}

          {/* Action row: CTA buttons (full width) */}
          <div className="track-detail__action-row track-detail__action-row--full">
            <div className="track-detail__actions">
              {songSkus.length > 0 && (
                <FormatShowcase
                  kind="song"
                  parentId={song.id}
                  title={song.title}
                  slug={song.slug}
                  coverArtPath={song.art_image_path || album?.cover_art_path || null}
                  skus={songSkus}
                />
              )}
              {album && releaseSkus.length > 0 && (
                <button
                  type="button"
                  className="track-detail__btn track-detail__btn--buy-album"
                  aria-expanded={albumFormatsOpen}
                  aria-controls="song-album-formats"
                  onClick={() => setAlbumFormatsOpen((v) => !v)}
                >
                  {albumFormatsOpen ? "Hide Album Formats" : "Choose Album Format"}
                </button>
              )}
              {ringtoneAvailable && song.ringtone_price && (
                <button
                  type="button"
                  className={`track-detail__btn track-detail__btn--ringtone${ringtoneInCart ? " track-detail__btn--in-cart" : ""}`}
                  disabled={ringtoneInCart}
                  aria-disabled={ringtoneInCart}
                  onClick={() => {
                    if (ringtoneInCart || !song.ringtone_price) return;
                    cart.add({
                      type: "ringtone",
                      id: song.id,
                      title: song.title,
                      slug: song.slug,
                      price: song.ringtone_price,
                      format: null,
                      cover_art_path: song.art_image_path || album?.cover_art_path || null,
                    });
                  }}
                >
                  {ringtoneInCart ? "Ringtone Already in Cart" : "Add Ringtone to Cart"}
                </button>
              )}
            </div>
          </div>

          {/* Collapsible album-format carousel -- expanded by the "Choose
              Album Format" button in the action row above. */}
          {album && releaseSkus.length > 0 && (
            <div
              id="song-album-formats"
              className={`track-detail__album-formats${albumFormatsOpen ? " is-open" : ""}`}
              aria-hidden={!albumFormatsOpen}
            >
              <div className="track-detail__album-formats-inner">
                <FormatShowcase
                  kind="release"
                  parentId={album.id}
                  title={album.title}
                  slug={album.slug}
                  coverArtPath={album.cover_art_path}
                  skus={releaseSkus}
                />
              </div>
            </div>
          )}

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

          {/* Credits */}
          {credits.length > 0 && (
            <div className="track-detail__section">
              <h3 className="track-detail__section-title">Credits</h3>
              <dl className="track-detail__credits">
                {credits.map((c) => (
                  <div key={c.id} className="track-detail__credit">
                    <dt className="track-detail__credit-role">{creditRoleLabel(c.role)}</dt>
                    <dd className="track-detail__credit-name">{c.name}</dd>
                  </div>
                ))}
              </dl>
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
      {(visibilitySections.length > 0 || geoFields || (ifYouLike && (ifYouLike.blurb || ifYouLike.entries.length > 0))) && (() => {
        const sectionMap = new Map(visibilitySections.map((s) => [s.category, s]));
        const story = sectionMap.get("story");
        const breakdown = sectionMap.get("breakdown");
        const world = sectionMap.get("world");
        const audience = sectionMap.get("audience");
        const fragments = sectionMap.get("fragments");
        const connections = sectionMap.get("connections");
        const culturalPosition = sectionMap.get("cultural-position");
        const syncPlacements = sectionMap.get("sync-placements");
        const ifYouLikeBlurb = ifYouLike?.blurb || null;
        const ifYouLikeEntries = ifYouLike?.entries || [];

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

            {/* 2. If You Like — manual structured entries: artist + title + reason per row */}
            {(ifYouLikeBlurb || ifYouLikeEntries.length > 0) && (
              <section className="song-landing__section song-landing__section--alt song-landing__section--if-you-like">
                <div className="song-landing__container">
                  <aside className="song-landing__aside">
                    <h2 className="song-landing__heading">Fans of these songs might like &ldquo;{song.title}&rdquo;</h2>
                    {ifYouLikeBlurb && (
                      <p className="song-landing__direct-answer">{ifYouLikeBlurb}</p>
                    )}
                  </aside>
                  <div className="song-landing__main">
                    {ifYouLikeEntries.length > 0 && (
                      <ul className="song-landing__if-you-like-list">
                        {ifYouLikeEntries.map((entry, i) => (
                          <li key={i} className="song-landing__if-you-like-entry">
                            <p className="song-landing__if-you-like-pair">
                              <strong>
                                {entry.artist}
                                {entry.title ? ` — ${entry.title}` : ""}
                              </strong>
                            </p>
                            {entry.reason && (
                              <p className="song-landing__if-you-like-reason">{entry.reason}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* 3. Who This Song Is For — speaks to the seeker's emotional state (format stack) */}
            {(audience?.directAnswer || audience?.contentHtml || (audience?.keyPointsHtml && audience.keyPointsHtml.length > 0)) && (
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
                        className="song-landing__prose prose"
                        dangerouslySetInnerHTML={{ __html: stripLeadingHeading(audience.contentHtml) }}
                      />
                    )}
                    {audience.keyPointsHtml && audience.keyPointsHtml.length > 0 && (
                      <div>
                        <h3 className="song-landing__column-heading">Made for</h3>
                        <ul className="song-landing__key-points">
                          {audience.keyPointsHtml.map((pt, i) => (
                            <li key={i} dangerouslySetInnerHTML={{ __html: pt }} />
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* 4. Inside the Song — thematic universe (format stack) */}
            {(world?.directAnswer || world?.contentHtml || (world?.keyPointsHtml && world.keyPointsHtml.length > 0)) && (
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
                        className="song-landing__prose prose"
                        dangerouslySetInnerHTML={{ __html: stripLeadingHeading(world.contentHtml) }}
                      />
                    )}
                    {world.keyPointsHtml && world.keyPointsHtml.length > 0 && (
                      <ul className="song-landing__key-points">
                        {world.keyPointsHtml.map((pt, i) => (
                          <li key={i} dangerouslySetInnerHTML={{ __html: pt }} />
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* 5. Lines That Stay — quotable fragments, high extraction value (format stack) */}
            {(fragments?.directAnswer || fragments?.contentHtml || (fragments?.keyPointsHtml && fragments.keyPointsHtml.length > 0)) && (
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
                        className="song-landing__prose song-landing__prose--fragments prose"
                        dangerouslySetInnerHTML={{ __html: stripLeadingHeading(fragments.contentHtml) }}
                      />
                    )}
                    {fragments.keyPointsHtml && fragments.keyPointsHtml.length > 0 && (
                      <ul className="song-landing__key-points">
                        {fragments.keyPointsHtml.map((pt, i) => (
                          <li key={i} dangerouslySetInnerHTML={{ __html: pt }} />
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* 6. The Bigger Picture — cultural position (format stack) */}
            {(culturalPosition?.directAnswer || culturalPosition?.contentHtml || (culturalPosition?.keyPointsHtml && culturalPosition.keyPointsHtml.length > 0)) && (
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
                        className="song-landing__prose prose"
                        dangerouslySetInnerHTML={{ __html: stripLeadingHeading(culturalPosition.contentHtml) }}
                      />
                    )}
                    {culturalPosition.keyPointsHtml && culturalPosition.keyPointsHtml.length > 0 && (
                      <ul className="song-landing__key-points">
                        {culturalPosition.keyPointsHtml.map((pt, i) => (
                          <li key={i} dangerouslySetInnerHTML={{ __html: pt }} />
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* 7. The Backstory — origin story, for the already-interested (format stack) */}
            {(story?.directAnswer || story?.contentHtml || (story?.keyPointsHtml && story.keyPointsHtml.length > 0)) && (
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
                        className="song-landing__prose prose"
                        dangerouslySetInnerHTML={{ __html: stripLeadingHeading(story.contentHtml) }}
                      />
                    )}
                    {story.keyPointsHtml && story.keyPointsHtml.length > 0 && (
                      <ul className="song-landing__key-points">
                        {story.keyPointsHtml.map((pt, i) => (
                          <li key={i} dangerouslySetInnerHTML={{ __html: pt }} />
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* 8. Behind the Music — craft & construction (format stack) */}
            {(breakdown?.directAnswer || breakdown?.contentHtml || (breakdown?.keyPointsHtml && breakdown.keyPointsHtml.length > 0)) && (
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
                        className="song-landing__prose prose"
                        dangerouslySetInnerHTML={{ __html: stripLeadingHeading(breakdown.contentHtml) }}
                      />
                    )}
                    {breakdown.keyPointsHtml && breakdown.keyPointsHtml.length > 0 && (
                      <ul className="song-landing__key-points">
                        {breakdown.keyPointsHtml.map((pt, i) => (
                          <li key={i} dangerouslySetInnerHTML={{ __html: pt }} />
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* 9. From the Same Universe — catalog cross-links (format stack) */}
            {(connections?.directAnswer || connections?.contentHtml || (connections?.keyPointsHtml && connections.keyPointsHtml.length > 0)) && (
              <section className="song-landing__section">
                <div className="song-landing__container">
                  <aside className="song-landing__aside">
                    <h2 className="song-landing__heading">What Other Chad Lewine Songs Connect to &ldquo;{song.title}&rdquo;?</h2>
                    {connections.directAnswer && (
                      <p className="song-landing__direct-answer">{connections.directAnswer}</p>
                    )}
                  </aside>
                  <div className="song-landing__main">
                    {connections.contentHtml && (
                      <div
                        className="song-landing__prose prose"
                        dangerouslySetInnerHTML={{ __html: stripLeadingHeading(connections.contentHtml) }}
                      />
                    )}
                    {connections.keyPointsHtml && connections.keyPointsHtml.length > 0 && (
                      <ul className="song-landing__key-points">
                        {connections.keyPointsHtml.map((pt, i) => (
                          <li key={i} dangerouslySetInnerHTML={{ __html: pt }} />
                        ))}
                      </ul>
                    )}
                    {connectionsSongs.length > 0 && (
                      <div className="connections-songs">
                        <ExploreGrid
                          items={connectionsSongs.map((s) => ({
                            key: `song:${s.id}`,
                            id: s.id,
                            slug: s.slug,
                            title: s.title,
                            image_url: s.art_image_path,
                            image_alt: s.art_alt || s.title,
                            href: `/music/songs/${s.slug}`,
                            kind: "song",
                          }))}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {/* 10. Sync Placements — GEO: where this song fits in film/TV/ads (format stack) */}
            {(syncPlacements?.directAnswer || syncPlacements?.contentHtml || (syncPlacements?.keyPointsHtml && syncPlacements.keyPointsHtml.length > 0)) && (
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
                        className="song-landing__prose prose"
                        dangerouslySetInnerHTML={{ __html: stripLeadingHeading(syncPlacements.contentHtml) }}
                      />
                    )}
                    {syncPlacements.keyPointsHtml && syncPlacements.keyPointsHtml.length > 0 && (
                      <ul className="song-landing__key-points">
                        {syncPlacements.keyPointsHtml.map((pt, i) => (
                          <li key={i} dangerouslySetInnerHTML={{ __html: pt }} />
                        ))}
                      </ul>
                    )}
                    <aside className="sync-callout">
                      <p className="sync-callout__eyebrow">Sync &middot; License &middot; Collaborate</p>
                      <h3 className="sync-callout__headline">
                        Hear &ldquo;{song.title}&rdquo; in your project?
                      </h3>
                      <p className="sync-callout__body">
                        Available for film, TV, advertising, games, and creative collaborations.
                      </p>
                      <Link href="/business" className="sync-callout__cta">
                        Start a Conversation &rarr;
                      </Link>
                    </aside>
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
