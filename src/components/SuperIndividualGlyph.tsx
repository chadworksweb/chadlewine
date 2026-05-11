interface Props {
  className?: string;
}

export function SuperIndividualGlyph({ className }: Props) {
  return (
    <svg
      viewBox="0 0 80 40"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="0" y="0" width="20" height="40" fill="currentColor" opacity="0.125" />
      <rect x="20" y="0" width="20" height="40" fill="currentColor" opacity="0.25" />
      <rect x="40" y="0" width="20" height="40" fill="currentColor" opacity="0.375" />
      <rect x="60" y="0" width="20" height="40" fill="currentColor" opacity="0.5" />
    </svg>
  );
}
