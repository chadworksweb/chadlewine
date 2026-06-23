// The orbiting-planet SVG used as ambient decoration (rings spin via the
// obsv-celestial__ring--* animations in global.css). Originally inlined on the
// observation detail page; extracted so the homepage writings section can reuse
// it as a parallax-fixed backdrop. `idPrefix` keeps the gradient/filter ids
// unique when more than one instance can land on the same page.
export function CelestialOrbit({ idPrefix = "obsv" }: { idPrefix?: string }) {
  const core = `${idPrefix}-core`;
  const glow = `${idPrefix}-glow`;
  const blur = `${idPrefix}-blur`;
  return (
    <svg className="obsv-celestial" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id={core} cx="30%" cy="30%">
          <stop offset="0%" stopColor="#b4bfff" />
          <stop offset="50%" stopColor="#8b9cf7" />
          <stop offset="100%" stopColor="#2a2a4e" />
        </radialGradient>
        <radialGradient id={glow} cx="50%" cy="50%">
          <stop offset="0%" stopColor="#8b9cf7" stopOpacity="0.3" />
          <stop offset="60%" stopColor="#8b9cf7" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#8b9cf7" stopOpacity="0" />
        </radialGradient>
        <filter id={blur} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
        </filter>
      </defs>
      <g opacity="0.25" stroke="#8b9cf7" strokeWidth="0.5" fill="none">
        <ellipse cx="200" cy="200" rx="162" ry="54" className="obsv-celestial__ring obsv-celestial__ring--1" />
        <ellipse cx="200" cy="200" rx="140" ry="45" className="obsv-celestial__ring obsv-celestial__ring--2" strokeDasharray="6 3" />
        <ellipse cx="200" cy="200" rx="100" ry="32" className="obsv-celestial__ring obsv-celestial__ring--3" />
      </g>
      <g opacity="0.5" fill="#8b9cf7">
        <circle cx="340" cy="185" r="3" />
        <circle cx="60" cy="215" r="2.5" />
        <circle cx="310" cy="160" r="2" />
      </g>
      <circle cx="200" cy="200" r="70" fill={`url(#${glow})`} filter={`url(#${blur})`} />
      <circle cx="200" cy="200" r="35" fill={`url(#${core})`} />
      <ellipse cx="200" cy="200" rx="55" ry="10" fill="none" stroke="#8b9cf7" strokeWidth="2" opacity="0.4" className="obsv-celestial__ring obsv-celestial__ring--front" />
      <g opacity="0.2">
        <circle cx="80" cy="120" r="1" fill="#fff" />
        <circle cx="320" cy="100" r="1.2" fill="#fff" />
        <circle cx="100" cy="300" r="1" fill="#fff" />
        <circle cx="310" cy="290" r="0.8" fill="#fff" />
      </g>
    </svg>
  );
}
