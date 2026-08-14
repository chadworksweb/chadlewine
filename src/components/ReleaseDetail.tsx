"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/components/Cart";
import { usePlayer } from "@/components/PlayerContext";
import { FormatShowcase, type FormatShowcaseSku } from "@/components/FormatShowcase";
import { CompassIcon } from "@/components/RisingCompassMark";
import type { SkuGalleryImage } from "@/lib/release-skus";

interface AlbumProps {
  id: string;
  title: string;
  slug: string;
  cover_art_path: string | null;
  cover_art_alt: string | null;
  release_date: string | null;
  // Free-text release window (e.g. "Summer 2026") shown while there's no firm
  // release_date. Sourced from label_meta.release_window; drives the preorder
  // "Expected" info cell.
  release_window: string | null;
  concept_statement: string | null;
  format_label: string | null;
}

interface SongProps {
  id: string;
  title: string;
  slug: string;
  track_number: number;
  duration_seconds: number | null;
  streaming_path: string | null;
  // Digital song SKU for the per-track buy button (null = not individually
  // purchasable). price is that SKU's price.
  sku_id: string | null;
  price: number | null;
  song_summary?: string | null;
  playback_mode?: "preview" | "full";
  ringtone_available?: boolean;
  ringtone_price?: number | null;
}

interface AlbumBadgeProps {
  tier: string;
  tierLabel: string;
  tierHex: string;
  charge: number;
  chargeSummary: string | null;
  contaminated: boolean;
  contaminationNote: string | null;
  artistSlug?: string | null;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const PLAY_RING_RADIUS = 12;
const PLAY_RING_CIRCUMFERENCE = 2 * Math.PI * PLAY_RING_RADIUS;

export function ReleaseDetail({
  album,
  songs,
  badge,
  skus = [],
}: {
  album: AlbumProps;
  songs: SongProps[];
  badge?: AlbumBadgeProps | null;
  skus?: FormatShowcaseSku[];
}) {
  const player = usePlayer();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeGallery, setActiveGallery] = useState<SkuGalleryImage[]>([]);
  const [activeGalleryUrl, setActiveGalleryUrl] = useState<string | null>(null);

  // Layered render of the active art image so swaps crossfade instead of
  // flashing. Each url change pushes a new layer; older layers drop out
  // once the new one's fade-in finishes.
  const [galleryLayers, setGalleryLayers] = useState<Array<{ key: number; url: string; alt: string }>>([]);
  const galleryLayerCounterRef = useRef(0);

  useEffect(() => {
    if (!activeGalleryUrl) {
      // Clear after the fade-out so the previous gallery image can dissolve
      // into the album cover beneath instead of snapping out.
      const t = setTimeout(() => setGalleryLayers([]), 420);
      return () => clearTimeout(t);
    }
    const meta = activeGallery.find((g) => g.url === activeGalleryUrl);
    const alt = meta?.alt || album.title;
    const key = ++galleryLayerCounterRef.current;
    setGalleryLayers((prev) => [...prev, { key, url: activeGalleryUrl, alt }]);
    const t = setTimeout(() => {
      setGalleryLayers((prev) => prev.filter((l) => l.key === key));
    }, 420);
    return () => clearTimeout(t);
  }, [activeGalleryUrl, activeGallery, album.title]);

  const handleFormatSelection = useCallback((sku: FormatShowcaseSku | null) => {
    const imgs = sku?.gallery_images ?? [];
    setActiveGallery(imgs);
    setActiveGalleryUrl(imgs[0]?.url ?? null);
  }, []);
  const cart = useCart();

  const year = album.release_date
    ? new Date(album.release_date).getFullYear()
    : null;

  // Playback is delegated to the shared PlayerContext (same engine as the
  // mini player + sticky player) so only one track plays at a time across the
  // whole app and the sticky bar reflects album-page playback. Pause/resume
  // are real pauses, not stop-and-restart.
  function handlePlay(song: SongProps) {
    if (!song.streaming_path) return;
    if (player.isCurrent(song.id)) {
      if (player.playing) player.pause();
      else player.resume();
      return;
    }
    player.play({
      id: song.id,
      slug: song.slug,
      title: song.title,
      streamingUrl: song.streaming_path,
      durationSeconds: song.duration_seconds ?? 0,
      artImagePath: album.cover_art_path,
      artAlt: album.cover_art_alt,
      playbackMode: song.playback_mode ?? "preview",
    });
  }

  const hasMultipleFormats = skus.length > 1;

  // Rising Compass badge -- rendered identically whether it lives in the
  // info bar (multiple formats) or the action row (single format). Falls
  // back to null when no badge data exists.
  const badgeBlock = badge ? (
    <div className="track-detail__rc-badge">
      <a
        href={badge.artistSlug ? `https://risingcompass.net/artists/${encodeURIComponent(badge.artistSlug)}` : "https://risingcompass.net"}
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
  ) : null;

  return (
    <div className="track-detail">
      <div className="track-detail__grid">
        {/* Left -- Album cover always sits as the base layer; the selected
            format gallery (if any) overlays it and crossfades on swap. */}
        <div className="track-detail__art-col">
          {album.cover_art_path && (
            <Image
              src={album.cover_art_path}
              alt={album.cover_art_alt || album.title}
              className="track-detail__cover"
              width={1200}
              height={1200}
              sizes="(max-width: 720px) 100vw, 600px"
              priority
            />
          )}
          {galleryLayers.length > 0 && (
            <div
              className={`track-detail__gallery-frame${activeGalleryUrl ? "" : " is-leaving"}`}
            >
              {galleryLayers.map((layer) => (
                /* eslint-disable-next-line @next/next/no-img-element -- gallery uploads vary; Next/Image optimizer over-compresses Bunny mockups. */
                <img
                  key={layer.key}
                  src={layer.url}
                  alt={layer.alt}
                  className="track-detail__gallery-img"
                  decoding="async"
                />
              ))}
            </div>
          )}
          {activeGallery.length > 1 && (
            <div
              className="product-detail__gallery product-detail__gallery--floating"
              role="list"
              aria-label="Format gallery"
            >
              {activeGallery.map((img) => {
                const isActive = img.url === activeGalleryUrl;
                return (
                  <button
                    key={img.id}
                    type="button"
                    role="listitem"
                    onClick={() => setActiveGalleryUrl(img.url)}
                    className={`product-detail__thumb${isActive ? " product-detail__thumb--active" : ""}`}
                    aria-current={isActive ? "true" : undefined}
                    aria-label={img.alt || "Show this image"}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={img.alt || ""} decoding="async" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right — Album content */}
        <div className="track-detail__content-col">
          <h1 className="track-detail__title">{album.title}</h1>

          {/* With multiple formats the album-level "Format" cell is ambiguous
             (FormatShowcase already shows them all), so we hide it and pull
             the Rising Compass badge up into the info bar in its place. */}
          {/* Info bar */}
          <div className="track-detail__info-bar" data-cols={3}>
            <div className="track-detail__info-cell">
              <span className="track-detail__info-label">Tracks</span>
              <span className="track-detail__info-value">{songs.length}</span>
            </div>
            {year ? (
              <div className="track-detail__info-cell">
                <span className="track-detail__info-label">Released</span>
                <span className="track-detail__info-value">{year}</span>
              </div>
            ) : album.release_window ? (
              <div className="track-detail__info-cell">
                <span className="track-detail__info-label">Expected</span>
                <span className="track-detail__info-value">{album.release_window}</span>
              </div>
            ) : null}
            {!hasMultipleFormats && album.format_label && (
              <div className="track-detail__info-cell">
                <span className="track-detail__info-label">Format</span>
                <span className="track-detail__info-value">{album.format_label}</span>
              </div>
            )}
            {hasMultipleFormats && badgeBlock && (
              <div className="track-detail__info-cell track-detail__info-cell--rc">
                {badgeBlock}
              </div>
            )}
          </div>

          {/* Action row: buy block (+ RC badge only when there's a single format) */}
          <div className="track-detail__action-row">
            <div className="track-detail__actions">
              <FormatShowcase
                kind="release"
                parentId={album.id}
                title={album.title}
                slug={album.slug}
                coverArtPath={album.cover_art_path}
                skus={skus}
                onSelectionChange={handleFormatSelection}
              />
            </div>

            {!hasMultipleFormats && badgeBlock}
          </div>

          {album.concept_statement && (
            <div className="track-detail__concept" style={{ whiteSpace: "pre-wrap" }}>
              {album.concept_statement}
            </div>
          )}

          {/* Playlist-style track listing */}
          {songs.length > 0 && (
            <ol className="album-detail__tracklist">
              {songs.map((song) => {
                const isActive = player.isCurrent(song.id);
                const isPlaying = isActive && player.playing;
                const rowProgress = isActive ? player.progress : 0;
                const hasAudio = !!song.streaming_path;
                const canDownload = !!song.sku_id && song.price !== null;
                const inCart = canDownload
                  ? cart.hasItem({ type: "song", id: song.id, format: null, sku_id: song.sku_id })
                  : false;
                const ringtoneAvailable = !!song.ringtone_available && !!song.ringtone_price;
                const ringtoneInCart = ringtoneAvailable
                  ? cart.hasItem({ type: "ringtone", id: song.id, format: null })
                  : false;

                const isExpanded = expandedId === song.id;
                const panelId = `tracklist-panel-${song.id}`;
                return (
                  <li
                    key={song.id}
                    className={`tracklist-row${isActive ? " tracklist-row--active" : ""}${!hasAudio ? " tracklist-row--no-audio" : ""}${isExpanded ? " tracklist-row--expanded" : ""}`}
                  >
                    <div
                      className="tracklist-row__head"
                      role="button"
                      tabIndex={0}
                      aria-expanded={isExpanded}
                      aria-controls={panelId}
                      onClick={() => setExpandedId((prev) => (prev === song.id ? null : song.id))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpandedId((prev) => (prev === song.id ? null : song.id));
                        }
                      }}
                    >
                      <span className="tracklist-row__num">
                        {String(song.track_number).padStart(2, "0")}
                      </span>
                      <button
                        type="button"
                        className="tracklist-row__play-btn"
                        onClick={hasAudio ? (e) => { e.stopPropagation(); handlePlay(song); } : undefined}
                        disabled={!hasAudio}
                        aria-label={isPlaying ? `Pause ${song.title}` : `Play ${song.title}`}
                      >
                        <svg
                          className="tracklist-row__play-ring"
                          viewBox="0 0 26 26"
                          aria-hidden="true"
                        >
                          <circle
                            className="tracklist-row__play-ring-track"
                            cx="13"
                            cy="13"
                            r={PLAY_RING_RADIUS}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          />
                          <circle
                            className="tracklist-row__play-ring-progress"
                            cx="13"
                            cy="13"
                            r={PLAY_RING_RADIUS}
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeDasharray={PLAY_RING_CIRCUMFERENCE}
                            strokeDashoffset={
                              PLAY_RING_CIRCUMFERENCE * (1 - rowProgress)
                            }
                            transform="rotate(-90 13 13)"
                          />
                        </svg>
                        <span
                          className={`tracklist-row__play-icon${isPlaying ? " tracklist-row__play-icon--pause" : ""}`}
                          aria-hidden="true"
                        >
                          {isPlaying ? (
                            <svg width="7" height="7" viewBox="0 0 10 10" fill="currentColor">
                              <rect x="0" y="0" width="3" height="10" />
                              <rect x="7" y="0" width="3" height="10" />
                            </svg>
                          ) : (
                            <svg width="7" height="8" viewBox="0 0 10 11" fill="currentColor">
                              <polygon points="0,0 10,5.5 0,11" />
                            </svg>
                          )}
                        </span>
                      </button>

                      <span className="tracklist-row__expand-btn">
                        <span className="tracklist-row__title">{song.title}</span>
                        <span className="tracklist-row__duration">
                          {song.duration_seconds ? formatDuration(song.duration_seconds) : "--"}
                        </span>
                      </span>

                      <button
                        type="button"
                        className={`tracklist-row__action tracklist-row__action--cart${inCart ? " is-added" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (inCart || !canDownload || !song.sku_id || song.price === null) return;
                          cart.add({
                            type: "song",
                            id: song.id,
                            title: song.title,
                            slug: song.slug,
                            price: song.price,
                            format: null,
                            sku_id: song.sku_id,
                            cover_art_path: album.cover_art_path,
                          });
                        }}
                        disabled={!canDownload || inCart}
                        aria-disabled={inCart}
                        aria-label={
                          !canDownload
                            ? "Not available"
                            : inCart
                              ? `${song.title} already in cart`
                              : `Add ${song.title} to cart`
                        }
                        title={
                          !canDownload
                            ? "Not available"
                            : inCart
                              ? "Added to cart"
                              : "Add to cart"
                        }
                      >
                        {inCart ? (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="16"
                            viewBox="0 0 30 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <polyline points="1,11 3,13 6,8" />
                            <circle cx="16" cy="21" r="1.6" />
                            <circle cx="25" cy="21" r="1.6" />
                            <path d="M10 4h2l2.4 11.2A2 2 0 0 0 16.36 17H26a2 2 0 0 0 1.95-1.56L29 8H13" />
                          </svg>
                        ) : (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="20"
                            height="16"
                            viewBox="0 0 30 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <line x1="4" y1="8" x2="4" y2="14" />
                            <line x1="1" y1="11" x2="7" y2="11" />
                            <circle cx="16" cy="21" r="1.6" />
                            <circle cx="25" cy="21" r="1.6" />
                            <path d="M10 4h2l2.4 11.2A2 2 0 0 0 16.36 17H26a2 2 0 0 0 1.95-1.56L29 8H13" />
                          </svg>
                        )}
                      </button>

                      {ringtoneAvailable && (
                        <button
                          type="button"
                          className={`tracklist-row__action${ringtoneInCart ? " is-added" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (ringtoneInCart || !song.ringtone_price) return;
                            cart.add({
                              type: "ringtone",
                              id: song.id,
                              title: song.title,
                              slug: song.slug,
                              price: song.ringtone_price,
                              format: null,
                              cover_art_path: album.cover_art_path,
                            });
                          }}
                          disabled={ringtoneInCart}
                          aria-disabled={ringtoneInCart}
                          aria-label={
                            ringtoneInCart
                              ? `${song.title} ringtone already in cart`
                              : `Add ${song.title} ringtone to cart`
                          }
                          title={ringtoneInCart ? "Ringtone added to cart" : "Add ringtone to cart"}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path
                              fillRule="evenodd"
                              clipRule="evenodd"
                              d="M5 2h7a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm2.5 2.25a.5.5 0 0 0 0 1h2a.5.5 0 0 0 0-1h-2zM9.5 9 6 12l3.5 3z"
                            />
                            <path d="M16.46 8.46a1 1 0 0 1 1.41 0 5 5 0 0 1 0 7.07 1 1 0 0 1-1.41-1.41 3 3 0 0 0 0-4.24 1 1 0 0 1 0-1.41z" />
                            <path d="M19.29 5.64a1 1 0 0 1 1.41 0 9 9 0 0 1 0 12.73 1 1 0 0 1-1.41-1.41 7 7 0 0 0 0-9.9 1 1 0 0 1 0-1.41z" />
                          </svg>
                        </button>
                      )}
                    </div>

                    <div
                      id={panelId}
                      className="tracklist-row__panel"
                      aria-hidden={!isExpanded}
                    >
                      <div className="tracklist-row__panel-inner">
                        {song.song_summary && (
                          <p className="tracklist-row__summary">{song.song_summary}</p>
                        )}
                        <Link
                          href={`/music/songs/${song.slug}`}
                          className="tracklist-row__cta"
                          tabIndex={isExpanded ? 0 : -1}
                        >
                          <span>Explore song</span>
                          <svg width="14" height="10" viewBox="0 0 14 10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <line x1="0" y1="5" x2="12" y2="5" />
                            <polyline points="8,1 12,5 8,9" />
                          </svg>
                        </Link>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

        </div>
      </div>
    </div>
  );
}
