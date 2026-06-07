/**
 * RisingCompassMark -- THE canonical, self-contained Rising Compass badge.
 *
 * This is the official visual mark of a Rising Compass classification: a chunky
 * half-circle gauge whose needle points into the song's tier band. It is the
 * single source of truth for the badge across the site -- do not inline copies.
 *
 * Self-contained: no external dependencies, just `charge` (+/-100) and the tier
 * hex. Band proportions and the charge->needle mapping mirror the Rising Compass
 * dial exactly (backend CHARGE_TIERS / charge_calc.py):
 *
 *   - Bands (gauge degrees, 0..180): violet 0-22.5, blue 22.5-67.5,
 *     green 67.5-112.5, orange 112.5-157.5, red 157.5-180. The poles
 *     (Ascended / Corrupted) are narrow 22.5 deg; the middle three tiers
 *     are 45 deg each.
 *   - Needle: degree = 90 - 0.9 * charge, so rotation from vertical is
 *     -0.9 * charge. At charge 0 the needle points straight up (Decent center);
 *     at +/-100 it reaches the violet / red poles, always landing in the song's
 *     true tier band.
 *
 * Keep the `rc-compass-icon` class: global.css uses it (display:block plus the
 * `.rtg__gauge` width/height override).
 */

function chargeToNeedleAngle(charge: number): number {
  const clamped = Math.max(-100, Math.min(100, charge));
  // Band-accurate: matches the dial's degree = 90 - 0.9 * charge mapping, so
  // the needle aims into the real tier band and reaches the poles at +/-100.
  return -0.9 * clamped;
}

export function RisingCompassMark({ charge, tierHex }: { charge: number; tierHex: string }) {
  const angle = chargeToNeedleAngle(charge);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 32 32" className="rc-compass-icon">
      <rect width="32" height="32" rx="6" fill="#0a0a14"/>
      <path d="M 5,20 A 11,11 0 0,1 5.84,15.79" fill="none" stroke="#9933ff" strokeWidth="6" strokeLinecap="butt"/>
      <path d="M 5.84,15.79 A 11,11 0 0,1 11.79,9.84" fill="none" stroke="#3388ff" strokeWidth="6" strokeLinecap="butt"/>
      <path d="M 11.79,9.84 A 11,11 0 0,1 20.21,9.84" fill="none" stroke="#33cc55" strokeWidth="6" strokeLinecap="butt"/>
      <path d="M 20.21,9.84 A 11,11 0 0,1 26.16,15.79" fill="none" stroke="#ffbb33" strokeWidth="6" strokeLinecap="butt"/>
      <path d="M 26.16,15.79 A 11,11 0 0,1 27,20" fill="none" stroke="#ff3333" strokeWidth="6" strokeLinecap="butt"/>
      <g transform={`rotate(${angle}, 16, 20)`}>
        <polygon points="16,10 14.2,20 17.8,20" fill="#eeeef4"/>
      </g>
      <circle cx="16" cy="20" r="3" fill={tierHex}/>
    </svg>
  );
}

// Back-compat alias: existing call sites import `CompassIcon`. New code should
// prefer the canonical `RisingCompassMark` name.
export { RisingCompassMark as CompassIcon };
