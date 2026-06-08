// Propose (and optionally apply) videos.song_id linkage by matching each video
// title to a released song. Music videos / live performances / VMVs of a song
// link to that song's row; non-song content (docs, open mics, lyric readings,
// thought pieces) stays NULL.
//
// Usage (from repo root):
//   node --env-file=.env.local scripts/videos/link-videos.mjs           # DRY RUN: print proposed mapping
//   node --env-file=.env.local scripts/videos/link-videos.mjs --apply   # write song_id for confident matches
//
// Confident match = a song title extracted from the video title resolves to
// exactly one published song. Behind-the-scenes / "story behind" / "reading the
// lyrics" videos are flagged REVIEW (they reference a song but aren't of it).

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");

const norm = (s) =>
  (s || "")
    .toLowerCase()
    .replace(/[‘’']/g, "")          // apostrophes
    .replace(/[^a-z0-9]+/g, " ")               // any other punctuation -> space
    .replace(/\s+/g, " ")
    .trim();

const { data: songs, error: se } = await supabase.from("songs").select("id,title,slug,status");
if (se) { console.error(se.message); process.exit(1); }
const songByNorm = new Map();
for (const s of songs) {
  if (s.status !== "published") continue;
  const k = norm(s.title);
  if (!songByNorm.has(k)) songByNorm.set(k, s); // first published wins
}

const { data: videos, error: ve } = await supabase.from("videos").select("id,title,slug,song_id");
if (ve) { console.error(ve.message); process.exit(1); }

// Video titles that reference a song but are NOT a video *of* the song.
const REVIEW_RE = /\b(BTS|story behind|story behind the|reading the lyrics|documentary|making of)\b/i;

function candidateFrom(title) {
  const q = title.match(/[“"]([^”"]+)[”"]/); // first quoted segment
  if (q) return q[1];
  let s = title.split(" - ")[0];          // part before first " - "
  s = s.replace(/\[[^\]]*\]/g, "");        // drop [Demo] etc.
  s = s.replace(/\([^)]*\)\s*$/g, "");     // drop trailing (Music Video) etc.
  return s.trim();
}

const link = [], review = [], none = [];
for (const v of videos) {
  const cand = candidateFrom(v.title);
  const song = songByNorm.get(norm(cand));
  if (song && REVIEW_RE.test(v.title)) review.push({ v, song, cand });
  else if (song) link.push({ v, song, cand });
  else none.push({ v, cand });
}

const pad = (s, n) => (s + " ".repeat(n)).slice(0, n);
console.log(`\n=== LINK (${link.length}) -- confident: video -> song ===`);
for (const { v, song } of link) console.log(`  ${pad(v.title, 52)} ->  ${song.title}`);
console.log(`\n=== REVIEW (${review.length}) -- references a song but may not be "of" it ===`);
for (const { v, song } of review) console.log(`  ${pad(v.title, 52)} ~?  ${song.title}`);
console.log(`\n=== NO SONG (${none.length}) -- stays NULL ===`);
for (const { v, cand } of none) console.log(`  ${pad(v.title, 52)}  (candidate: "${cand}")`);

if (!APPLY) {
  console.log(`\nDRY RUN. Re-run with --apply to set song_id for the ${link.length} LINK rows (REVIEW + NO SONG untouched).`);
  process.exit(0);
}

let ok = 0, fail = 0;
for (const { v, song } of link) {
  const { error } = await supabase.from("videos").update({ song_id: song.id }).eq("id", v.id);
  if (error) { fail++; console.log(`  FAIL ${v.title}: ${error.message}`); }
  else ok++;
}
console.log(`\nApplied: ${ok} linked, ${fail} failed.`);
