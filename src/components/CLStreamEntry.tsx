import { formatDate } from "@/lib/utils";

interface CLStreamSong {
  id: string;
  title: string;
  artist: string;
  album: string | null;
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
      <div className="cl-stream-entry__header">
        <span className="cl-stream-entry__title">{song.title}</span>
        {song.rc_color && (
          <span className="cl-stream-entry__badge" data-color={song.rc_color}>
            {song.rc_color}{chargeStr ? ` ${chargeStr}` : ""}
          </span>
        )}
      </div>
      <p className="cl-stream-entry__artist">
        {song.artist}
        {song.album && <span className="cl-stream-entry__album"> · {song.album}</span>}
      </p>
      {song.note && <p className="cl-stream-entry__note">{song.note}</p>}
      <time className="cl-stream-entry__date">{formatDate(song.created_at)}</time>
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
