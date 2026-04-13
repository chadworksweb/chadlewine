/** Shared Rising Compass badge — used on track/album detail pages and CL Stream. */

const COLOR_HEX: Record<string, string> = {
  violet: "#9933ff",
  blue: "#3388ff",
  green: "#33cc55",
  orange: "#ffbb33",
  red: "#ff3333",
};

const COLOR_LABEL: Record<string, string> = {
  violet: "Ascended",
  blue: "Elevated",
  green: "Decent",
  orange: "Degraded",
  red: "Corrupted",
};

export function rcTierHex(color: string): string {
  return COLOR_HEX[color] ?? "#888";
}

export function rcTierLabel(color: string): string {
  return COLOR_LABEL[color] ?? color;
}

function chargeToNeedleAngle(charge: number): number {
  const clamped = Math.max(-100, Math.min(100, charge));
  return -(clamped / 100) * 58;
}

export function CompassIcon({ charge, tierHex }: { charge: number; tierHex: string }) {
  const angle = chargeToNeedleAngle(charge);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 32 32" className="rc-compass-icon">
      <rect width="32" height="32" rx="6" fill="#0a0a14"/>
      <path d="M 5,20 A 11,11 0 0,1 7.6,13.1" fill="none" stroke="#9933ff" strokeWidth="6" strokeLinecap="butt"/>
      <path d="M 7.6,13.1 A 11,11 0 0,1 12.6,9.6" fill="none" stroke="#3388ff" strokeWidth="6" strokeLinecap="butt"/>
      <path d="M 12.6,9.6 A 11,11 0 0,1 19.4,9.6" fill="none" stroke="#33cc55" strokeWidth="6" strokeLinecap="butt"/>
      <path d="M 19.4,9.6 A 11,11 0 0,1 24.4,13.1" fill="none" stroke="#ffbb33" strokeWidth="6" strokeLinecap="butt"/>
      <path d="M 24.4,13.1 A 11,11 0 0,1 27,20" fill="none" stroke="#ff3333" strokeWidth="6" strokeLinecap="butt"/>
      <g transform={`rotate(${angle}, 16, 20)`}>
        <polygon points="16,10 14.2,20 17.8,20" fill="#eeeef4"/>
      </g>
      <circle cx="16" cy="20" r="3" fill={tierHex}/>
    </svg>
  );
}
