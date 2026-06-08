// LRCLIB pre-flight: report lyrics/duration/album coverage for the catalog.
// Run: node --env-file=.env.local scripts/lrclib/check-coverage.mjs
// Reports counts and lists songs missing lyrics. No secrets or lyric text printed.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } = await supabase
  .from("songs")
  .select(
    "id,title,slug,duration_seconds,isrc,instrumental,status,lyrics,release_songs(release_id,releases(title,release_date,status))"
  );

if (error) {
  console.error("Query failed:", error.message);
  process.exit(1);
}

const hasLyrics = (s) => typeof s.lyrics === "string" && s.lyrics.trim().length > 0;

// Earliest release a song appears on (its "album name" for LRCLIB).
const primaryRelease = (s) => {
  const rels = (s.release_songs || [])
    .map((rs) => rs.releases)
    .filter(Boolean)
    .sort((a, b) => String(a.release_date || "").localeCompare(String(b.release_date || "")));
  return rels[0] || null;
};

const published = data.filter((s) => s.status === "published");
const eligible = published.filter((s) => !s.instrumental); // skip instrumentals

const withLyrics = eligible.filter(hasLyrics);
const withDuration = eligible.filter((s) => s.duration_seconds > 0);
const withRelease = eligible.filter((s) => primaryRelease(s));

console.log("=== LRCLIB coverage ===");
console.log("songs rows total:            ", data.length);
console.log("published:                   ", published.length);
console.log("published, non-instrumental: ", eligible.length, "(submission pool)");
console.log("  - with lyrics:             ", withLyrics.length);
console.log("  - with duration_seconds:   ", withDuration.length);
console.log("  - with a resolvable album: ", withRelease.length);
console.log(
  "  - FULLY ready (lyrics+dur+album):",
  eligible.filter((s) => hasLyrics(s) && s.duration_seconds > 0 && primaryRelease(s)).length
);

const missingLyrics = eligible.filter((s) => !hasLyrics(s)).map((s) => s.title).sort();
console.log(`\n--- eligible songs MISSING lyrics (${missingLyrics.length}) ---`);
for (const t of missingLyrics) console.log("  ", t);

const missingDur = eligible
  .filter((s) => hasLyrics(s) && !(s.duration_seconds > 0))
  .map((s) => s.title)
  .sort();
console.log(`\n--- have lyrics but MISSING duration (${missingDur.length}) ---`);
for (const t of missingDur) console.log("  ", t);
