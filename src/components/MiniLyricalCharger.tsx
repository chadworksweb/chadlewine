"use client";

import { useState } from "react";

interface CalibrateResult {
  status: string;
  tier?: string | null;
  tier_label?: string | null;
  charge?: number | null;
  contaminated?: boolean;
  contamination_note?: string | null;
  charge_summary?: string | null;
  confidence?: number;
  title?: string | null;
  artist?: string | null;
  block_reason?: string | null;
}

const TIER_COLOR: Record<string, string> = {
  red: "#cc2233",
  orange: "#dd7722",
  yellow: "#ccaa22",
  green: "#33aa55",
  blue: "#3388cc",
};

interface MiniLyricalChargerProps {
  /** Self-tag for the originating surface, forwarded to RC as `source`
   *  (e.g. "super-individual"). When omitted, the proxy defaults to
   *  "chadlewine". Lets RC distinguish which chadlewine surface a
   *  submitted_songs row came from. */
  source?: string;
}

export function MiniLyricalCharger({ source }: MiniLyricalChargerProps = {}) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<CalibrateResult | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setResult(null);

    if (lyrics.trim().length < 20) {
      setError("Paste a fuller chunk of lyrics (at least 20 characters).");
      return;
    }
    if (!title.trim() || !artist.trim()) {
      setError("Title and artist are required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/rc/calibrate-lyrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          artist: artist.trim(),
          lyrics: lyrics.trim(),
          ...(source ? { source } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Calibration failed.");
      } else {
        setResult(data);
      }
    } catch (err) {
      setError((err as Error).message || "Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setResult(null);
    setError("");
  }

  if (result && result.status === "scored") {
    const tierColor = result.tier ? TIER_COLOR[result.tier] || "#888" : "#888";
    return (
      <div className="mini-charger mini-charger--result">
        <div className="mini-charger__result-header">
          <span
            className="mini-charger__tier-pill"
            style={{ background: tierColor }}
          >
            {result.tier_label || result.tier}
          </span>
          {result.charge != null && (
            <span className="mini-charger__charge">{result.charge}</span>
          )}
        </div>
        <div className="mini-charger__result-song">
          <strong>{result.title}</strong> — {result.artist}
        </div>
        {result.charge_summary && (
          <p className="mini-charger__summary">{result.charge_summary}</p>
        )}
        {result.contaminated && result.contamination_note && (
          <p className="mini-charger__contam">⚠ {result.contamination_note}</p>
        )}
        <div className="mini-charger__result-actions">
          <button type="button" className="mini-charger__btn-secondary" onClick={reset}>
            Test another
          </button>
          <a
            href="https://risingcompass.net/lyrical-charger/"
            target="_blank"
            rel="noopener noreferrer"
            className="mini-charger__btn-primary"
          >
            Full reading on Rising Compass →
          </a>
        </div>
      </div>
    );
  }

  if (result && result.status !== "scored") {
    return (
      <div className="mini-charger mini-charger--blocked">
        <p className="mini-charger__blocked-msg">
          {result.block_reason || "We couldn't read this submission. Try the full Lyrical Charger for more context."}
        </p>
        <div className="mini-charger__result-actions">
          <button type="button" className="mini-charger__btn-secondary" onClick={reset}>
            Try again
          </button>
          <a
            href="https://risingcompass.net/lyrical-charger/"
            target="_blank"
            rel="noopener noreferrer"
            className="mini-charger__btn-primary"
          >
            Full Lyrical Charger →
          </a>
        </div>
      </div>
    );
  }

  return (
    <form className="mini-charger" onSubmit={handleSubmit}>
      <div className="mini-charger__row">
        <input
          type="text"
          className="mini-charger__input"
          placeholder="Song title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          required
        />
        <input
          type="text"
          className="mini-charger__input"
          placeholder="Artist"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          maxLength={200}
          required
        />
      </div>
      <textarea
        className="mini-charger__textarea"
        placeholder="Paste a chunk of lyrics — verse, chorus, or the whole thing. The more you give it, the sharper the read."
        value={lyrics}
        onChange={(e) => setLyrics(e.target.value)}
        rows={6}
        maxLength={20000}
        required
      />
      {error && <p className="mini-charger__error">{error}</p>}
      <div className="mini-charger__actions mini-charger__actions--stacked">
        <button
          type="submit"
          className="mini-charger__btn-primary mini-charger__btn-primary--full"
          disabled={submitting}
        >
          {submitting ? "Calibrating Lyrics…" : "Calibrate Lyrics"}
        </button>
        <a
          href="https://risingcompass.net/lyrical-charger/"
          target="_blank"
          rel="noopener noreferrer"
          className="mini-charger__btn-link"
        >
          Or use the full Charger →
        </a>
      </div>
    </form>
  );
}
