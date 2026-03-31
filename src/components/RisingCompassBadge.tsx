interface Props {
  score: number;
  classification?: string | null;
  size?: "sm" | "md";
}

export function RisingCompassBadge({ score, classification, size = "md" }: Props) {
  return (
    <span className={`rc-badge rc-badge--${size}`}>
      <span className="rc-badge__score">{score.toFixed(1)}</span>
      {classification && <span className="rc-badge__label">{classification}</span>}
    </span>
  );
}
