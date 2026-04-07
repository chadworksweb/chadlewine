/**
 * Full Rising Compass badge — hydrated from the RC API.
 * Used on song and album pages.
 */
interface RisingCompassBadgeProps {
  tier: string;
  tierLabel: string;
  tierHex: string;
  charge: number;
  chargeSummary: string | null;
  contaminated: boolean;
  contaminationNote: string | null;
}

export function RisingCompassBadge({
  tier,
  tierLabel,
  tierHex,
  charge,
  chargeSummary,
  contaminated,
  contaminationNote,
}: RisingCompassBadgeProps) {
  const sign = charge > 0 ? "+" : "";

  return (
    <div className="rc-badge">
      <a
        href="https://risingcompass.net"
        target="_blank"
        rel="noopener noreferrer"
        className="rc-badge__source"
      >
        Rising Compass
      </a>
      <div className="rc-badge__inner">
        <span
          className="rc-badge__tier"
          style={{ backgroundColor: tierHex }}
        >
          {tierLabel}
        </span>
        <span className="rc-badge__charge">{sign}{charge}</span>
      </div>
      {chargeSummary && (
        <p className="rc-badge__summary">{chargeSummary}</p>
      )}
      {contaminated && contaminationNote && (
        <p className="rc-badge__contamination">{contaminationNote}</p>
      )}
    </div>
  );
}

/**
 * Lightweight inline badge for curation pages.
 * Uses score + classification stored in Supabase, not the RC API.
 */
interface RisingCompassScoreBadgeProps {
  score: number;
  classification?: string | null;
  size?: "sm" | "md";
}

export function RisingCompassScoreBadge({ score, classification, size = "md" }: RisingCompassScoreBadgeProps) {
  return (
    <span className={`rc-score-badge rc-score-badge--${size}`}>
      <span className="rc-score-badge__score">{score.toFixed(1)}</span>
      {classification && <span className="rc-score-badge__label">{classification}</span>}
    </span>
  );
}
