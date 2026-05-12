"use client";

import { useEffect, useState } from "react";

interface SongRow {
  id: number;
  title: string;
  artist: string;
  position: number;
  rubric_color: string | null;
  charge_value: number | null;
  contaminated: boolean;
  charge_summary: string | null;
  song_slug: string | null;
  instrumental: boolean;
}

interface CompassData {
  has_reading: boolean;
  songs: SongRow[];
}

export function RCTop10Card() {
  const [data, setData] = useState<CompassData | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/rc/compass-current")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: CompassData) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const top10 = (data?.songs ?? []).slice(0, 10).sort((a, b) => a.position - b.position);

  return (
    <div className="rc-card rc-card--top10">
      <div className="rc-card__header">Daily Top 10 Songs</div>
      <p className="rc-card__desc">Today&rsquo;s most-heard, individually charged.</p>
      {errored && (
        <p className="rc-card__error">
          Couldn&rsquo;t load the daily reading.{" "}
          <a href="https://risingcompass.net" target="_blank" rel="noopener noreferrer">
            Open Rising Compass &rarr;
          </a>
        </p>
      )}
      {!errored && top10.length === 0 && (
        <p className="rc-card__placeholder">Loading&hellip;</p>
      )}
      {top10.length > 0 && (
        <ul className="rc-song-list">
          {top10.map((song) => {
            const dotClass = song.instrumental ? "" : song.rubric_color ?? "";
            const href = song.song_slug ? `https://risingcompass.net/songs/${song.song_slug}` : null;
            const title = href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="rc-song-list__title-link"
              >
                {song.title}
              </a>
            ) : (
              song.title
            );
            return (
              <li key={song.id} className="rc-song-list__item">
                <span className="rc-song-list__pos">{song.position}</span>
                <span className={`rc-song-list__dot ${dotClass}`} aria-hidden="true" />
                <div
                  className="rc-song-list__info"
                  title={`${song.title} – ${song.artist}`}
                >
                  <span className="rc-song-list__title">{title}</span>
                  <span className="rc-song-list__sep" aria-hidden="true"> &ndash; </span>
                  <span className="rc-song-list__artist">{song.artist}</span>
                </div>
                {song.charge_value != null && (
                  <span className={`rc-song-list__score ${song.rubric_color ?? ""}`}>
                    {song.charge_value > 0 ? "+" : ""}
                    {song.charge_value}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
