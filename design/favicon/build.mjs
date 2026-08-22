// Regenerate every chadlewine.com favicon asset from params.json.
//
//   node design/favicon/build.mjs
//
// Nothing in out/ is drawn and nothing there should be edited. Change a number
// in params.json, re-run, and the master SVG, the PNG ladder, the .ico and the
// installed copies in public/ all move together. That is the whole point of
// keeping this file: a favicon that only exists as exported binaries cannot be
// adjusted six months from now without redrawing it.
//
// What the mark is
// ----------------
// The wordmark in the nav is flanked by a shade ramp built from block drawing
// characters -- see .site-nav__logo-frame in Nav.tsx, and the same string on
// the curation cards. Four characters, four densities, one ink:
//
//   light  ....  solid  ....  light
//     U+2591 U+2592 U+2593 U+2588 U+2593 U+2592 U+2591
//
// A block character fakes its density by stippling one colour. Pixels do not
// need the fake, so the reduction is real alpha: seven bars, mirrored around a
// solid centre, stepping 0.25 / 0.5 / 0.75 / 1 and back down, with the outer
// bars shortened so the silhouette peaks in the middle. Method is the one the
// LEAM pillar favicon used -- draw at the size it is consumed at, keep a
// handful of elements thick enough to survive, throw the rest away.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const OUT = join(HERE, "out");

const P = JSON.parse(readFileSync(join(HERE, "params.json"), "utf8"));

// Straight off src/styles/global.css. Do not substitute a palette: the mark IS
// --text-accent, the same value the nav glyphs are painted in.
const TONES = {
  accent: "#8b9cf7", // --text-accent
  white: "#e4e4ec", // --text-primary
  gold: "#d8b25c",
  cyan: "#6ee7ff",
};

// The nav logo's hover shimmer, frozen: each density step takes the colour that
// step of the @keyframes logo-shape-shimmer animation lands on.
const CHROMA = ["#8b9cf7", "#ff7ad9", "#6ee7ff", "#d8b25c"];

const GROUNDS = {
  none: null,
  deep: "#07070d", // --bg-deep
  panel: "#13131c", // --bg-elevated
  paper: "#ffffff", // not a site token; the suite's light-ground master only
};

// Apple composites a transparent icon against black, which happens to be this
// site's own ground, so the opaque tile is painted --bg-deep rather than white.
const APPLE_GROUND = "#07070d";

const r = (n) => Math.round(n * 100) / 100;

// Snapping is the whole reason the bench existed. A bar edge that lands on a
// half unit is a half pixel at 16px, and a half pixel is a grey smear where a
// hard step should be.
function unit(s) {
  if (s.snap === "32") return 1;
  if (s.snap === "16") return 2;
  return 0;
}

function snapv(v, s) {
  const u = unit(s);
  if (u) return Math.round(v / u) * u;
  return r(v);
}

// Alpha per cell, left to right. Mirrored around one solid centre, or a single
// climb ending solid.
function levels(s) {
  const n = Math.max(1, Math.round(s.cells));
  let out = [];
  if (s.mode === "single") {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (n - 1 - i) / (n - 1);
      out.push(1 - t * s.falloff);
    }
  } else {
    const half = (n - 1) / 2;
    for (let i = 0; i < n; i++) {
      const t = half === 0 ? 0 : Math.abs(i - half) / half;
      out.push(1 - t * s.falloff);
    }
  }
  if (s.steps >= 2) {
    const q = Math.round(s.steps);
    out = out.map((a) => Math.max(1 / q, Math.ceil(a * q) / q));
  }
  return out.map((a) => Math.max(0.04, Math.min(1, Math.round(a * 1000) / 1000)));
}

function heightOf(i, n, base, s) {
  if (!s.heightRamp) return base;
  const half = (n - 1) / 2;
  const d = s.mode === "single" ? n - 1 - i : Math.abs(i - half);
  const span = s.mode === "single" ? n - 1 : half;
  const t = span === 0 ? 0 : d / span;
  return base * (1 - t * s.heightRamp);
}

function toneFor(a, s) {
  if (s.tone !== "chroma") return TONES[s.tone] || TONES.accent;
  // Floor, not round: rounding collapses two adjacent density steps onto one
  // colour and the ramp loses a hue.
  const idx = Math.floor((1 - a) * CHROMA.length);
  return CHROMA[Math.min(CHROMA.length - 1, Math.max(0, idx))];
}

// An honest reproduction of what a block character does: one ink, punched
// through at a coverage that approximates the alpha. Kept because it is the
// thing the shipped mark decided against, and a decision with no way to re-run
// it is just an assertion.
function ditherRect(x, y, w, h, fill, a) {
  const cell = 1;
  let out = "";
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  for (let row = 0; row < rows; row++) {
    for (let c = 0; c < cols; c++) {
      const v = ((row * 2 + c * 3) % 4) / 4;
      if (v >= a) continue;
      const cw = Math.min(cell, w - c * cell);
      const ch = Math.min(cell, h - row * cell);
      if (cw <= 0 || ch <= 0) continue;
      out +=
        `<rect x="${x + c * cell}" y="${y + row * cell}" width="${cw}"` +
        ` height="${ch}" fill="${fill}"/>`;
    }
  }
  return out;
}

export function buildSVG(s = P) {
  const n = Math.max(1, Math.round(s.cells));
  const L = levels(s);
  const pad = s.pad;
  const avail = 32 - pad * 2;

  // Quantise the bar and the gap FIRST, then fit, then centre. The other order
  // lets a snapped bar grow the ramp back past its padding.
  const u = unit(s);
  const step = u || 0.5;
  let bw = Math.max(step, snapv(s.barW, s));
  let gp = Math.max(0, snapv(s.gap, s));
  // Never let the ramp outgrow its padding. Squeeze the gap first, then the
  // bars: a gap is spacing, a bar is the mark.
  while (n * bw + (n - 1) * gp > avail && gp > 0) gp = Math.max(0, gp - step);
  while (n * bw + (n - 1) * gp > avail && bw > step) bw -= step;
  const total = n * bw + (n - 1) * gp;
  const x0 = Math.max(0, snapv((32 - total) / 2, s));
  const baseH = Math.min(s.barH, avail);

  const parts = [];
  const ground = GROUNDS[s.tile];
  if (ground) {
    parts.push(
      `<rect x="0" y="0" width="32" height="32" rx="${s.tileRadius}" fill="${ground}"/>`,
    );
  }

  // Merge neighbouring cells that share a fill, an alpha AND a height into one
  // rect. Two overlapping shapes of the same fill composite their antialiased
  // edges twice and print a darker seam down the join.
  const runs = [];
  for (let i = 0; i < n; i++) {
    const a = L[i];
    const h = heightOf(i, n, baseH, s);
    const fill = toneFor(a, s);
    const key = `${fill}|${Math.round(a * 1000)}|${Math.round(h * 100)}`;
    const last = runs[runs.length - 1];
    if (gp === 0 && last && last.key === key) last.count++;
    else runs.push({ key, count: 1, a, h, fill, start: i });
  }

  for (const run of runs) {
    const x = snapv(x0 + run.start * (bw + gp), s);
    const w = snapv(run.count * bw + (run.count - 1) * gp, s);
    const h = snapv(run.h, s);
    const y = snapv((32 - h) / 2, s);
    if (w <= 0 || h <= 0) continue;
    if (s.dither) {
      parts.push(ditherRect(x, y, w, h, run.fill, run.a));
    } else {
      const rx = s.cap === "round" ? Math.min(w, h) / 2 : s.radius;
      parts.push(
        `<rect x="${x}" y="${y}" width="${w}" height="${h}"` +
          (rx ? ` rx="${r(rx)}"` : "") +
          ` fill="${run.fill}"` +
          (run.a < 1 ? ` opacity="${run.a}"` : "") +
          "/>",
      );
    }
  }

  // Corner brackets, straight off .curation-door__bar::before / ::after.
  if (s.brackets) {
    const st = snapv(s.brStroke, s) || 0.5;
    const bh = snapv(Math.min(s.brH, avail), s);
    const by = snapv((32 - bh) / 2, s);
    const arm = snapv(s.brW, s);
    const lx = snapv(pad, s);
    // Mirror the left bracket rather than measuring in from the right edge: an
    // unsnapped pad and a snapped one land the arms on different columns and
    // the pair reads crooked.
    const rx2 = 32 - lx - arm;
    const c = TONES[s.tone === "chroma" ? "accent" : s.tone] || TONES.accent;
    [lx, rx2].forEach((bx, k) => {
      parts.push(`<rect x="${bx}" y="${by}" width="${arm}" height="${st}" fill="${c}"/>`);
      parts.push(
        `<rect x="${bx}" y="${by + bh - st}" width="${arm}" height="${st}" fill="${c}"/>`,
      );
      const sx = k === 0 ? bx : bx + arm - st;
      parts.push(`<rect x="${sx}" y="${by}" width="${st}" height="${bh}" fill="${c}"/>`);
    });
  }

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
    parts.join("") +
    "</svg>\n"
  );
}

// ---------------------------------------------------------------------------
// Rasterizing
// ---------------------------------------------------------------------------

// Render the SVG at each size's own density rather than downscaling a big PNG.
// A 512 resampled to 16 is a different mark: every hard step turns into a
// gradient and the whole reduction is undone at the last moment.
async function png(svg, size, ground) {
  const density = (72 * size) / 32;
  let img = sharp(Buffer.from(svg), { density }).resize(size, size, {
    fit: "contain",
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (ground) img = img.flatten({ background: ground });
  return img.png({ compressionLevel: 9 }).toBuffer();
}

// A .ico is a 6-byte header, one 16-byte directory entry per size, then the
// payloads. PNG payloads (not BMP) are what every browser since IE11 reads.
function ico(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(entries.length, 4);

  const dir = Buffer.alloc(16 * entries.length);
  let offset = header.length + dir.length;

  entries.forEach((e, i) => {
    const at = i * 16;
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, at + 0); // 0 means 256
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, at + 1);
    dir.writeUInt8(0, at + 2); // palette count
    dir.writeUInt8(0, at + 3); // reserved
    dir.writeUInt16LE(1, at + 4); // colour planes
    dir.writeUInt16LE(32, at + 6); // bits per pixel
    dir.writeUInt32LE(e.buf.length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += e.buf.length;
  });

  return Buffer.concat([header, dir, ...entries.map((e) => e.buf)]);
}

// ---------------------------------------------------------------------------

const LADDER = [16, 32, 48, 64, 128, 180, 192, 256, 512];

// ---------------------------------------------------------------------------
// The shareable suite
// ---------------------------------------------------------------------------
//
//   node design/favicon/build.mjs --suite
//
// Writes a self-contained copy of the mark to the branding folder in Dropbox,
// for everything that is not this website: avatars, decks, print, a collaborator
// who needs the logo and does not have the repo. Regenerated rather than
// snapshotted, so it can never drift from params.json.
//
// The suite carries opaque variants because the web assets cannot be used as an
// avatar. Every platform composites a transparent PNG against a ground of its
// own choosing, and half of them choose white, where a 0.25-alpha outer bar
// nearly vanishes.

const SUITE_DIR = join(
  "C:",
  "Users",
  "chad",
  "Dropbox",
  "Chad Lewine",
  "branding",
  "chadlewine-icon-suite",
);

const SUITE_LADDER = LADDER.concat([1024]);
const SUITE_OPAQUE = [256, 512, 1024];

async function buildSuite(svg) {
  const png_ = join(SUITE_DIR, "png");
  mkdirSync(png_, { recursive: true });

  // Masters. The transparent one is the file to hand anybody who asks for the
  // logo; the other two exist so a vector workflow on a fixed ground does not
  // have to draw its own backing rect.
  writeFileSync(join(SUITE_DIR, "chadlewine-icon.svg"), svg);
  writeFileSync(
    join(SUITE_DIR, "chadlewine-icon-on-deep.svg"),
    buildSVG({ ...P, tile: "deep", tileRadius: 0 }),
  );
  writeFileSync(
    join(SUITE_DIR, "chadlewine-icon-on-white.svg"),
    buildSVG({ ...P, tile: "paper", tileRadius: 0 }),
  );

  for (const size of SUITE_LADDER) {
    writeFileSync(join(png_, `chadlewine-icon-${size}.png`), await png(svg, size));
  }
  // Square, never rounded. Platforms apply their own corner radius or circle
  // crop, and a mark that arrives pre-rounded gets rounded twice.
  for (const size of SUITE_OPAQUE) {
    writeFileSync(
      join(png_, `chadlewine-icon-on-deep-${size}.png`),
      await png(svg, size, "#07070d"),
    );
    writeFileSync(
      join(png_, `chadlewine-icon-on-white-${size}.png`),
      await png(svg, size, "#ffffff"),
    );
  }

  writeFileSync(join(SUITE_DIR, "favicon.ico"), readFileSync(join(OUT, "favicon.ico")));
  writeFileSync(
    join(SUITE_DIR, "apple-icon-180.png"),
    readFileSync(join(OUT, "apple-icon.png")),
  );

  writeFileSync(join(SUITE_DIR, "README.md"), suiteReadme());
  console.log(`\nsuite -> ${SUITE_DIR}`);
}

function suiteReadme() {
  return `# chadlewine.com icon suite

The site's mark, in every form anything outside the website needs. Locked
2026-08-21.

**Do not edit these files.** They are generated. The source of truth is
\`design/favicon/params.json\` in the chadlewine repo, and everything here is
rebuilt with:

\`\`\`
node design/favicon/build.mjs --suite
\`\`\`

Change a number there, re-run that, and this folder is replaced. Editing a PNG
here means the next rebuild silently throws the edit away.

## What the mark is

The shade ramp that flanks the wordmark in the site header, reduced until it
survives a 16 pixel browser tab. Seven bars, mirrored around a solid centre,
each step lighter and shorter than the one inside it. The colour is the site's
accent, \`#8b9cf7\`.

## Which file to use

| Need | File |
|---|---|
| Anything that scales, any ground | \`chadlewine-icon.svg\` |
| A profile picture or avatar | \`png/chadlewine-icon-on-deep-512.png\` |
| Placing on a white page, a doc, print | \`png/chadlewine-icon-on-white-512.png\` |
| A deck or a video needing a big raster | \`png/chadlewine-icon-1024.png\` |
| Handing someone a browser icon | \`favicon.ico\` |

**Reach for an opaque file for any avatar.** Platforms composite a transparent
PNG against whatever ground they like, and on white the faintest bars nearly
disappear. The transparent PNGs are for places where you control what sits
behind the mark.

The opaque tiles are square on purpose. Platforms apply their own corner
rounding or circle crop, and a mark that arrives pre-rounded gets rounded twice.
The mark clears a circle crop at every size here.

## Contents

- \`chadlewine-icon.svg\` — master, transparent
- \`chadlewine-icon-on-deep.svg\` — master on \`#07070d\`, the site's ground
- \`chadlewine-icon-on-white.svg\` — master on white
- \`png/chadlewine-icon-{16..1024}.png\` — transparent, ten sizes
- \`png/chadlewine-icon-on-deep-{256,512,1024}.png\` — opaque
- \`png/chadlewine-icon-on-white-{256,512,1024}.png\` — opaque
- \`favicon.ico\` — 16 / 32 / 48
- \`apple-icon-180.png\` — iOS home screen, already flattened onto \`#07070d\`

Every raster is rendered from the vector at its own size, never resampled down
from a larger one, so the small sizes keep their hard edges.

The slider bench the numbers came from:
<https://claude.ai/code/artifact/332e75b9-39f3-4fbb-8cfe-4407a58a94ef>
`;
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const svg = buildSVG();
  writeFileSync(join(HERE, "ramp-favicon.svg"), svg);

  for (const size of LADDER) {
    writeFileSync(join(OUT, `icon-${size}.png`), await png(svg, size));
  }

  const icoSizes = [16, 32, 48];
  const icoBufs = [];
  for (const size of icoSizes) icoBufs.push({ size, buf: await png(svg, size) });
  writeFileSync(join(OUT, "favicon.ico"), ico(icoBufs));

  writeFileSync(join(OUT, "apple-icon.png"), await png(svg, 180, APPLE_GROUND));

  // Installed copies. layout.tsx points at these paths; public/ is what the
  // Next app actually serves.
  const install = [
    ["ramp-favicon.svg", join(ROOT, "public", "favicon.svg"), svg],
    ["out/favicon.ico", join(ROOT, "public", "favicon.ico"), null],
    ["out/apple-icon.png", join(ROOT, "public", "apple-icon.png"), null],
    ["out/icon-192.png", join(ROOT, "public", "icon-192.png"), null],
    ["out/icon-512.png", join(ROOT, "public", "icon-512.png"), null],
  ];
  for (const [from, to, inline] of install) {
    writeFileSync(to, inline !== null ? inline : readFileSync(join(HERE, from)));
  }

  console.log(svg.trim());
  console.log(
    `\nwrote ${LADDER.length} png + favicon.ico + apple-icon.png -> design/favicon/out/`,
  );
  console.log(
    "installed -> public/favicon.svg, favicon.ico, apple-icon.png, icon-192.png, icon-512.png",
  );

  if (process.argv.includes("--suite")) await buildSuite(svg);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
