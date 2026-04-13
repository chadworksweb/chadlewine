import { formatDate } from "@/lib/utils";

interface CLStreamSong {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  album_art_url: string | null;
  note: string | null;
  source_url: string | null;
  rc_color: string | null;
  rc_charge: number | null;
  created_at: string;
}

export function CLStreamEntry({ song }: { song: CLStreamSong }) {
  const chargeStr =
    song.rc_charge != null
      ? song.rc_charge > 0
        ? `+${song.rc_charge}`
        : `${song.rc_charge}`
      : null;

  const inner = (
    <div className="cl-stream-entry">
      <div className="cl-stream-entry__art-wrap">
        {song.album_art_url ? (
          <img
            src={song.album_art_url}
            alt={`${song.title} by ${song.artist}`}
            className="cl-stream-entry__art"
          />
        ) : (
          <div className="cl-stream-entry__art-placeholder" />
        )}
        {song.rc_color && (
          <span
            className="cl-stream-entry__color-dot"
            data-color={song.rc_color}
            title={`${song.rc_color}${chargeStr ? ` ${chargeStr}` : ""}`}
          />
        )}
      </div>

      <div className="cl-stream-entry__content">
        <div className="cl-stream-entry__meta">
          <time className="cl-stream-entry__date">{formatDate(song.created_at)}</time>
          {song.rc_color && chargeStr && (
            <span className="cl-stream-entry__charge">{chargeStr}</span>
          )}
        </div>
        <p className="cl-stream-entry__title">{song.title}</p>
        <p className="cl-stream-entry__artist">
          {song.artist}
          {song.album && <span className="cl-stream-entry__album"> · {song.album}</span>}
        </p>
        {song.note && <p className="cl-stream-entry__note">{song.note}</p>}
      </div>
    </div>
  );

  return song.source_url ? (
    <a href={song.source_url} target="_blank" rel="noopener noreferrer" className="cl-stream-entry-link">
      {inner}
    </a>
  ) : (
    <div className="cl-stream-entry-link">{inner}</div>
  );
}
