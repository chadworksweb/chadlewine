"use client";

import { useState } from "react";
import { formatDate } from "@/lib/utils";
import { CompassIcon } from "@/components/RisingCompassMark";
import { rcBadgeHref, rcArtistHref, type RisingCompassBadgeData } from "@/lib/rising-compass";

interface CLStreamSong {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  note: string | null;
  source_url: string | null;
  created_at: string;
  // Live badge data — fetched by the caller at render time from RC's
  // badge API. Null when RC has no calibration yet (or the fetch timed out).
  badge: RisingCompassBadgeData | null;
}

export function CLStreamEntry({ song }: { song: CLStreamSong }) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const tierHex = song.badge?.tier_hex ?? null;
  const tierLabel = song.badge?.tier_label ?? null;
  const charge = song.badge?.charge ?? 0;
  const chargeStr = song.badge && song.badge.charge != null
    ? (song.badge.charge > 0 ? `+${song.badge.charge}` : `${song.badge.charge}`)
    : null;
  const chargeSummary = song.badge?.charge_summary ?? null;
  const pending = song.badge?.pending === true;

  const inner = (
    <div className="feed-entry feed-entry--stream">
      <div className="feed-entry__content">
        <div className="feed-entry__meta">
          <time className="feed-entry__date">Added {formatDate(song.created_at)}</time>
          {song.source_url && (
            <a
              href={song.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="cl-stream-entry__listen"
            >
              Listen &#8599;
            </a>
          )}
        </div>
        <div className="cl-stream-entry-body">
          <div className="cl-stream-entry-body__text">
            <h2 className="feed-entry__title">
              <a
                href={rcBadgeHref(song.badge)}
                target="_blank"
                rel="noopener noreferrer"
                className="cl-stream-entry__link"
              >
                {song.title}
              </a>
              <span style={{ opacity: 0.45, fontWeight: 400 }}>
                {" "}&mdash;{" "}
                <a
                  href={rcArtistHref(song.artist)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cl-stream-entry__link"
                >
                  {song.artist}
                </a>
              </span>
            </h2>
            {song.album && (
              <p className="feed-entry__hook"><em>{song.album}</em></p>
            )}
            {song.note && (
              <div className="cl-stream-note-bubble">{song.note}</div>
            )}
          </div>
          {tierHex && chargeStr && (
            <div className="track-detail__rc-badge" style={{ flexShrink: 0 }}>
              {pending && (
                <span
                  className="track-detail__rc-pending-stamp"
                  aria-label="Pending recalibration"
                  title="This score is being contested — a recalibration is pending review."
                >
                  PENDING
                </span>
              )}
              <a href={rcBadgeHref(song.badge)} target="_blank" rel="noopener noreferrer" className="track-detail__rc-compass-link">
                <CompassIcon charge={charge} tierHex={tierHex} />
              </a>
              <div className="track-detail__rc-data">
                <span className="track-detail__rc-tier" style={{ color: tierHex }}>
                  {tierLabel}
                </span>
                <div className="track-detail__rc-charge-row">
                  <span className="track-detail__rc-charge">{chargeStr}</span>
                  {chargeSummary && (
                    <div className="track-detail__rc-summary-wrap">
                      <button
                        type="button"
                        className="track-detail__rc-summary-btn"
                        onClick={(e) => { e.preventDefault(); setSummaryOpen((v) => !v); }}
                        aria-label="Read charge summary"
                        title="Charge summary"
                      >
                        &#x1F4AC;
                      </button>
                      {summaryOpen && (
                        <div className="track-detail__rc-summary-tooltip">
                          <p>{chargeSummary}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return <div className="archive__feed-item">{inner}</div>;
}
