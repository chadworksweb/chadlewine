"use client";

import { useEffect, useState } from "react";

interface CompassCurrent {
  has_reading: boolean;
  date?: string;
  compass_degree: number;
  charge_level: string;
  charge_score?: number;
  contamination_count: number;
  editorial_summary?: string | null;
  songs?: Array<{
    title: string;
    artist: string;
    rubric_color?: string | null;
    charge_value?: number | null;
    chart_position?: number | null;
  }>;
  historical_degree: number;
  historical_charge: string;
}

const RUBRIC_COLOR_BG: Record<string, string> = {
  red: "#cc2233",
  orange: "#dd7722",
  yellow: "#ccaa22",
  green: "#33aa55",
  blue: "#3388cc",
};

export function RCNowPlayingTile() {
  const [data, setData] = useState<CompassCurrent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/rc/compass-current")
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.json();
      })
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="rc-now-tile rc-now-tile--loading">
        <span className="rc-now-tile__label">Today on the Compass</span>
        <span className="rc-now-tile__placeholder">Loading…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rc-now-tile rc-now-tile--error">
        <span className="rc-now-tile__label">Today on the Compass</span>
        <a href="https://risingcompass.net" target="_blank" rel="noopener noreferrer" className="rc-now-tile__fallback-link">
          Open the Rising Compass →
        </a>
      </div>
    );
  }

  const topSong = data.songs?.[0];
  const score = data.charge_score ?? null;

  return (
    <div className="rc-now-tile">
      <span className="rc-now-tile__label">Today on the Compass</span>
      <div className="rc-now-tile__body">
        <div className="rc-now-tile__charge">
          <span className="rc-now-tile__charge-level">{data.charge_level}</span>
          {score != null && (
            <span className="rc-now-tile__score">{score}</span>
          )}
        </div>
        {topSong && (
          <div className="rc-now-tile__top">
            <span className="rc-now-tile__top-label">Top track</span>
            <div className="rc-now-tile__top-song">
              {topSong.rubric_color && (
                <span
                  className="rc-now-tile__rubric-dot"
                  style={{ background: RUBRIC_COLOR_BG[topSong.rubric_color] || "#888" }}
                  aria-label={`Rubric color: ${topSong.rubric_color}`}
                />
              )}
              <span className="rc-now-tile__top-title">{topSong.title}</span>
              <span className="rc-now-tile__top-artist">— {topSong.artist}</span>
            </div>
          </div>
        )}
        {data.editorial_summary && (
          <p className="rc-now-tile__summary">{data.editorial_summary}</p>
        )}
      </div>
      <a
        href="https://risingcompass.net"
        target="_blank"
        rel="noopener noreferrer"
        className="rc-now-tile__cta"
      >
        Open the Rising Compass →
      </a>
    </div>
  );
}
