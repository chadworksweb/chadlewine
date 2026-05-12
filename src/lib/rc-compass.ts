// Verbatim port of rising-compass/frontend/js/compass.js.
// Renders the half-circle gauge into a given container element, then
// updates the needle / score / charge label imperatively. Same DOM shape
// + same class names so the original compass.css applies unchanged.

const COLORS = ["violet", "blue", "green", "orange", "red"] as const;
const COLOR_HEX: Record<string, string> = {
  violet: "#aa54ff",
  blue: "#3388ff",
  green: "#33cc55",
  orange: "#ffbb33",
  red: "#ff3333",
};

// SVG geometry: half-circle, center at (180, 170), radius 130
const CX = 180;
const CY = 170;
const R = 130;
const ARC_WIDTH = 18;

function degToRad(deg: number) {
  return Math.PI - (deg / 180) * Math.PI;
}

function polarToCart(angleDeg: number, radius: number) {
  const rad = degToRad(angleDeg);
  return {
    x: CX + radius * Math.cos(rad),
    y: CY - radius * Math.sin(rad),
  };
}

function arcPath(startDeg: number, endDeg: number, radius: number) {
  const s = polarToCart(startDeg, radius);
  const e = polarToCart(endDeg, radius);
  const largeArc = endDeg - startDeg > 90 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${largeArc} 1 ${e.x} ${e.y}`;
}

export function renderCompass(container: HTMLElement) {
  let svg = `<svg class="compass-svg" viewBox="0 -10 360 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Compass gauge showing current charge level">`;

  const arcSpan = 36;
  const TIER_LABELS = ["Ascended", "Elevated", "Decent", "Degraded", "Corrupted"];
  const labelR = R + ARC_WIDTH / 2 + 11;

  svg += "<defs>";
  TIER_LABELS.forEach((_label, i) => {
    const startDeg = i * arcSpan;
    const endDeg = startDeg + arcSpan;
    const s = polarToCart(startDeg, labelR);
    const e = polarToCart(endDeg, labelR);
    svg += `<path id="tier-path-${i}" d="M ${s.x} ${s.y} A ${labelR} ${labelR} 0 0 1 ${e.x} ${e.y}" fill="none" />`;
  });
  svg += "</defs>";

  COLORS.forEach((color, i) => {
    const startDeg = i * arcSpan;
    const endDeg = startDeg + arcSpan;
    const path = arcPath(startDeg, endDeg, R);
    svg += `<path class="compass-arc ${color}" data-color="${color}" d="${path}" />`;
  });

  for (let deg = 0; deg <= 180; deg += 18) {
    const isMajor = deg % 36 === 0;
    const outerR = R + ARC_WIDTH / 2 + 4;
    const innerR = R + ARC_WIDTH / 2 + (isMajor ? 12 : 8);
    const o = polarToCart(deg, outerR);
    const inner = polarToCart(deg, innerR);
    svg += `<line class="${isMajor ? "compass-tick-major" : "compass-tick"}" x1="${o.x}" y1="${o.y}" x2="${inner.x}" y2="${inner.y}" />`;
  }

  TIER_LABELS.forEach((label, i) => {
    svg += `<text class="compass-tier-label"><textPath href="#tier-path-${i}" startOffset="50%" text-anchor="middle">${label}</textPath></text>`;
  });

  svg += `<g class="compass-ghost-trail" data-rc-ghost></g>`;

  svg += `<g class="compass-needle" data-rc-needle>`;
  svg += `<polygon class="needle-line" points="${CX},${CY - R + 15} ${CX - 4},${CY} ${CX + 4},${CY}" />`;
  svg += `<circle class="needle-cap" cx="${CX}" cy="${CY}" r="8" />`;
  svg += `</g>`;

  svg += `<rect class="compass-score-bg" x="${CX - 48}" y="${CY + 22}" width="96" height="38" rx="4" />`;
  svg += `<text class="compass-score-text" data-rc-score x="${CX}" y="${CY + 50}">--</text>`;
  svg += `<rect class="compass-label-bg" data-rc-label-bg x="${CX - 62}" y="${CY + 66}" width="124" height="29" rx="3" />`;
  svg += `<text class="compass-label-text" data-rc-charge x="${CX}" y="${CY + 86}">LOADING</text>`;
  svg += `<text class="compass-date-text" data-rc-date x="${CX}" y="${CY + 110}"></text>`;
  svg += `</svg>`;

  container.innerHTML = svg;
}

export function setCompassDegree(container: HTMLElement, degree: number, chargeLevel: string) {
  const needle = container.querySelector<SVGGElement>("[data-rc-needle]");
  if (!needle) return;
  const rotation = degree - 90;
  needle.style.transform = `rotate(${rotation}deg)`;

  const scoreEl = container.querySelector<SVGTextElement>("[data-rc-score]");
  const score = Math.round(((90 - degree) * 100) / 90);
  if (scoreEl) {
    scoreEl.textContent = (score > 0 ? "+" : "") + score;
  }

  const labels: Record<string, string> = {
    violet: "ASCENDED",
    blue: "ELEVATED",
    green: "DECENT",
    orange: "DEGRADED",
    red: "CORRUPTED",
  };
  const chargeText = container.querySelector<SVGTextElement>("[data-rc-charge]");
  if (chargeText) {
    chargeText.textContent = labels[chargeLevel] || chargeLevel.toUpperCase();
  }

  const svgEl = container.querySelector("svg.compass-svg");
  if (svgEl) {
    const label = labels[chargeLevel] || chargeLevel;
    svgEl.setAttribute("aria-label", `Compass: ${score > 0 ? "+" : ""}${score}, ${label}`);
  }

  const labelBg = container.querySelector("[data-rc-label-bg]");
  if (labelBg) {
    const hex = COLOR_HEX[chargeLevel] || "#888";
    labelBg.setAttribute("fill", hex);
    labelBg.setAttribute("opacity", "0.15");
    labelBg.setAttribute("stroke", hex);
    labelBg.setAttribute("stroke-opacity", "0.4");
  }
}

export function setCompassDate(container: HTMLElement, dateText: string) {
  const dateEl = container.querySelector<SVGTextElement>("[data-rc-date]");
  if (dateEl) dateEl.textContent = dateText;
}
