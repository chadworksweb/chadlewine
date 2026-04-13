import { formatDate } from "@/lib/utils";
import { CompassIcon, rcTierHex, rcTierLabel } from "@/components/RCBadge";

interface CLStreamSong {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  note: string | null;
  source_url: string | null;
  rc_color: string | null;
  rc_charge: number | null;
  rc_charge_summary?: string | null;
  created_at: string;
}

export function CLStreamEntry({ song }: { song: CLStreamSong }) {
  const tierHex = song.rc_color ? rcTierHex(song.rc_color) : null;
  const tierLabel = song.rc_color ? rcTierLabel(song.rc_color) : null;
  const charge = song.rc_charge ?? 0;
  const chargeStr = song.rc_charge != null
    ? (song.rc_charge > 0 ? `+${song.rc_charge}` : `${song.rc_charge}`)
    : null;

  const inner = (
    <div className="feed-entry feed-entry--stream">
      <div className="feed-entry__content" style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-md)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="feed-entry__meta">
            <time className="feed-entry__date">{formatDate(song.created_at)}</time>
          </div>
          <h2 className="feed-entry__title">
            {song.title}
            <span style={{ opacity: 0.45, fontWeight: 400 }}> — {song.artist}</span>
          </h2>
          {song.album && (
            <p className="feed-entry__hook"><em>{song.album}</em></p>
          )}
          {song.note && (
            <p className="feed-entry__hook" style={{ marginTop: "var(--space-xs)" }}>
              {song.note}
            </p>
          )}
        </div>
        {tierHex && chargeStr && (
          <div className="track-detail__rc-badge" style={{ flexShrink: 0, marginTop: "var(--space-xs)" }}>
            <a href="https://risingcompass.net" target="_blank" rel="noopener noreferrer" className="track-detail__rc-compass-link">
              <CompassIcon charge={charge} tierHex={tierHex} />
            </a>
            <div className="track-detail__rc-data">
              <span className="track-detail__rc-tier" style={{ color: tierHex }}>
                {tierLabel}
              </span>
              <span className="track-detail__rc-charge">{chargeStr}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="archive__feed-item">
      {song.source_url ? (
        <a href={song.source_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", color: "inherit" }}>
          {inner}
        </a>
      ) : inner}
    </div>
  );
}
