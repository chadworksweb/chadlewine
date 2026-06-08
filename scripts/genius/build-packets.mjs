// Build paste-ready Genius submission packets for the Chad Lewine catalog.
//
// Genius has NO write API for lyrics -- songs are added manually via the
// desktop "ADD SONG" web form (song facts + lyrics, then community review).
// This script pulls each released recording's title / primary-release album /
// release date / plain lyrics from Supabase and writes one paste-ready packet
// per song, plus a tracking index, so the manual submission is mechanical.
//
// Usage (from repo root):
//   node --env-file=.env.local scripts/genius/build-packets.mjs           # INSPECT: print manifest only
//   node --env-file=.env.local scripts/genius/build-packets.mjs --write   # write packet files + index
//
// Output: scripts/genius/packets/<NNN>-<slug>.md (one per song)
//         scripts/genius/packets/_INDEX.md       (submission tracking table)
//
// Genius is more permissive than LRCLIB: duration is NOT required, so songs
// that have lyrics but no duration (skipped on LRCLIB) DO qualify here.

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "packets");
const ARTIST = "Chad Lewine";
const WRITE = process.argv.slice(2).includes("--write");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } = await supabase
  .from("songs")
  .select(
    "id,title,slug,duration_seconds,instrumental,status,lyrics,release_songs(releases(title,release_date))"
  );
if (error) { console.error("Query failed:", error.message); process.exit(1); }

// Released singles that exist in the DB only under the dateless forthcoming
// "Don't Blame Me" album (TBD 2026), so they inherit no date. Override with
// their real single release date + album so Genius gets accurate metadata.
// (Choose Lit already has its own dated release; no override needed.)
const DATE_OVERRIDE = {
  "Don't Blame Me": { album: "Don't Blame Me", date: "2025-06-27" },
  "Turn The Mill": { album: "Turn The Mill", date: "2025-08-13" },
  "Johnny Boy": { album: "Johnny Boy", date: "2025-11-07" },
};

// Producer credits per release (Chad, 2026-06-08). Keyed by resolved album/
// single title. Default = ["Chad Lewine"] (covers everything up to Pivotal
// Days). Releases mapped to [] get NO producer line.
const PRODUCERS = {
  "The Human Link": ["Anthony Krizan", "Chad Lewine"],
  "Dark Nights": ["Mr. HO"],
  "HYPERISING": ["Siem Spark", "Chad Lewine"],
  "Pivotal Days": [],
  "Don't Blame Me": [],
  "Turn The Mill": [],
  "Johnny Boy": [],
  "Choose Lit": [],
};
const producersFor = (album) =>
  Object.prototype.hasOwnProperty.call(PRODUCERS, album) ? PRODUCERS[album] : ["Chad Lewine"];

// Earliest release that actually has a date (a real, shipped release).
const datedRelease = (s) => {
  const rels = (s.release_songs || [])
    .map((rs) => rs.releases)
    .filter((r) => r && r.release_date)
    .sort((a, b) => String(a.release_date).localeCompare(String(b.release_date)));
  return rels[0] || null;
};

// Resolved primary release for Genius: a dated release, or a known override.
// Returns null for songs that are not yet released (dateless-only) -> held.
const primaryRelease = (s) => {
  const dated = datedRelease(s);
  if (dated) return dated;
  const ov = DATE_OVERRIDE[s.title];
  return ov ? { title: ov.album, release_date: ov.date } : null;
};

// Mirror the LRCLIB / entity-catalog exclusions: released catalog only --
// drop the Demoesque compilation and "(Demo)" titles.
const isExcluded = (s) => {
  const album = (primaryRelease(s)?.title || "").toLowerCase();
  if (album === "demoesque") return true;
  if (/\(demo\)/i.test(s.title)) return true;
  return false;
};

// Flag alt versions (share lyrics with a primary version) so Chad can decide
// per-song whether to make a separate Genius page. Not auto-excluded.
const isAltVersion = (title) =>
  /\((sped up|acoustic|piano demo|extended|instrumental|interlude|remix|live)\)/i.test(title) ||
  /\b(extended mix|interlude)\b/i.test(title);

const hasLyrics = (s) => typeof s.lyrics === "string" && s.lyrics.trim().length > 0;

const base = data
  .filter((s) => s.status === "published" && !s.instrumental)
  .filter((s) => !isExcluded(s));

const released = base.filter((s) => primaryRelease(s)); // has a dated release or override
const held = base.filter((s) => !primaryRelease(s));    // dateless-only -> not yet released

const withLyrics = released.filter(hasLyrics);
const noLyrics = released.filter((s) => !hasLyrics(s));

const records = withLyrics
  .map((s) => {
    const rel = primaryRelease(s);
    return {
      slug: s.slug,
      title: s.title,
      album: rel.title,
      date: rel.release_date || "",
      year: (rel.release_date || "").slice(0, 4),
      lyrics: s.lyrics.trim(),
      alt: isAltVersion(s.title),
      producers: producersFor(rel.title),
    };
  })
  .sort((a, b) => (a.date || "").localeCompare(b.date || "") || a.title.localeCompare(b.title));

// ---- Report --------------------------------------------------------------
console.log(`Released catalog (published, non-instrumental, dated): ${released.length}`);
console.log(`  with lyrics  -> packetable: ${records.length}  (${records.filter((r) => r.alt).length} alt-version)`);
console.log(`  NO lyrics    -> cannot packet: ${noLyrics.length}`);
if (noLyrics.length) {
  console.log(`\n  Missing-lyrics songs (fill in admin, then re-run):`);
  for (const s of noLyrics.sort((a, b) => a.title.localeCompare(b.title)))
    console.log(`    - ${s.title}  (${primaryRelease(s).title})`);
}
if (held.length) {
  console.log(`\n  HELD -- not yet released (dateless release only); do NOT submit to Genius yet:`);
  for (const s of held.sort((a, b) => a.title.localeCompare(b.title)))
    console.log(`    - ${s.title}`);
}

if (!WRITE) {
  console.log(`\nInspect only. Re-run with --write to emit ${records.length} packet files + index.`);
  process.exit(0);
}

// ---- Write packets -------------------------------------------------------
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const num = (i) => String(i + 1).padStart(3, "0");
const packetBody = (r) =>
  `# ${r.title}\n\n` +
  `## Genius song facts\n` +
  `- Primary Artist: ${ARTIST}\n` +
  `- Title: ${r.title}\n` +
  `- Album: ${r.album}\n` +
  `- Release Date: ${r.date || "(unknown)"}\n` +
  `- Writer: ${ARTIST}\n` +
  `- Producers: ${r.producers.length ? r.producers.join(", ") : "(none)"}\n` +
  `- Primary Tag: Pop\n` +
  (r.alt ? `- NOTE: alt version -- shares lyrics with a primary cut; submit as its own page only if desired.\n` : ``) +
  `\n## Lyrics (paste into the Genius lyrics field)\n\n` +
  `${r.lyrics}\n`;

for (const [i, r] of records.entries()) {
  writeFileSync(join(OUT_DIR, `${num(i)}-${r.slug}.md`), packetBody(r));
}

// Structured data for the automated submit driver (localStorage seed source).
writeFileSync(
  join(OUT_DIR, "packets.json"),
  JSON.stringify(
    records.map((r, i) => ({
      n: num(i),
      slug: r.slug,
      title: r.title,
      album: r.album,
      date: r.date,
      year: r.year,
      month: r.date ? parseInt(r.date.slice(5, 7), 10) : null,
      day: r.date ? parseInt(r.date.slice(8, 10), 10) : null,
      writer: ARTIST,
      producers: r.producers,
      lyrics: r.lyrics,
      alt: r.alt,
    })),
    null,
    2
  )
);

const indexRows = records
  .map((r, i) => `| ${num(i)} | ${r.title}${r.alt ? " *(alt)*" : ""} | ${r.album} | ${r.year} | | |`)
  .join("\n");
const index =
  `# Genius submission tracking -- Chad Lewine\n\n` +
  `Generated from the live \`songs\` table. ${records.length} packetable recordings ` +
  `(${records.filter((r) => r.alt).length} alt-version). Each row has a packet file ` +
  `\`<NNN>-<slug>.md\` in this folder.\n\n` +
  `Submit at https://genius.com -> ADD SONG (desktop web). Paste the song facts, then the lyrics.\n\n` +
  `| # | Title | Album | Year | Submitted | Live URL |\n` +
  `|---|-------|-------|------|-----------|----------|\n` +
  `${indexRows}\n`;
writeFileSync(join(OUT_DIR, "_INDEX.md"), index);

console.log(`\nWrote ${records.length} packets + _INDEX.md to ${OUT_DIR}`);
