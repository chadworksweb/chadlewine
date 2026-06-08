// Promote Don't Blame Me, Turn The Mill, Johnny Boy from tracks on the dateless
// forthcoming "Don't Blame Me" album into their own dated single releases
// (mirroring Choose Lit). The album row stays as the forthcoming-album container
// for its 8 remaining unreleased tracks.
//
// Usage:
//   node --env-file=.env.local scripts/videos/singles.mjs           # DRY RUN
//   node --env-file=.env.local scripts/videos/singles.mjs --apply   # write
//
// Per single: insert a releases row (type=single, published, dated, cover art) +
// a release_songs link (track 1), then unlink the song from the album. Finally
// renumber the album's remaining tracks 1..N.

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");
const ALBUM_ID = "de0e06ce-694e-4e8d-b88c-bcc02d3deeac"; // "Don't Blame Me" album

const SINGLES = [
  {
    songSlug: "dont-blame-me-track",
    title: "Don't Blame Me",
    slug: "dont-blame-me-single",
    release_date: "2025-06-25",
    cover_art_path: "https://chadlewine-site-images.b-cdn.net/cover-art-web/dont-blame-me.webp",
    cover_art_alt: "Don't Blame Me single art",
  },
  {
    songSlug: "turn-the-mill",
    title: "Turn The Mill",
    slug: "turn-the-mill",
    release_date: "2025-08-13",
    cover_art_path: "https://chadlewine-cover-art.b-cdn.net/Turn-The-Mill_Chad-Lewine_song-track-art.webp",
    cover_art_alt: "Turn The Mill single art",
  },
  {
    songSlug: "johnny-boy",
    title: "Johnny Boy",
    slug: "johnny-boy",
    release_date: "2025-11-07",
    cover_art_path: "https://chadlewine-cover-art.b-cdn.net/Johnny-Boy_Chad-Lewine_song-track-art.webp",
    cover_art_alt: "Johnny Boy single art",
  },
];

// Resolve song ids
const { data: songs, error: se } = await supabase
  .from("songs")
  .select("id,title,slug")
  .in("slug", SINGLES.map((s) => s.songSlug));
if (se) { console.error(se.message); process.exit(1); }
const songId = Object.fromEntries(songs.map((s) => [s.slug, s.id]));

console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}\n`);
for (const s of SINGLES) {
  console.log(`SINGLE: "${s.title}"  slug=${s.slug}  date=${s.release_date}  song=${songId[s.songSlug] || "??"}`);
}

if (!APPLY) {
  console.log(`\nWould: create 3 single releases, link each song (track 1), unlink the 3 from the album, renumber album.`);
  console.log(`Re-run with --apply.`);
  process.exit(0);
}

for (const s of SINGLES) {
  const sid = songId[s.songSlug];
  if (!sid) { console.log(`  SKIP ${s.title} -- song not found`); continue; }
  const releaseId = randomUUID();
  const { error: re } = await supabase.from("releases").insert({
    id: releaseId,
    title: s.title,
    slug: s.slug,
    release_date: s.release_date,
    cover_art_path: s.cover_art_path,
    cover_art_alt: s.cover_art_alt,
    status: "published",
    release_type: "single",
    display_order: 0,
    hero_zoom: 1, card_zoom: 1, portrait_zoom: 1,
  });
  if (re) { console.log(`  FAIL insert release ${s.title}: ${re.message}`); continue; }
  const { error: le } = await supabase.from("release_songs").insert({ release_id: releaseId, song_id: sid, track_number: 1 });
  if (le) { console.log(`  FAIL link ${s.title}: ${le.message}`); continue; }
  const { error: ue } = await supabase.from("release_songs").delete().eq("release_id", ALBUM_ID).eq("song_id", sid);
  if (ue) { console.log(`  FAIL unlink-from-album ${s.title}: ${ue.message}`); continue; }
  console.log(`  OK  ${s.title} -> release ${releaseId} (linked, unlinked from album)`);
}

// Renumber the album's remaining tracks 1..N (preserve existing order)
const { data: rem, error: rme } = await supabase
  .from("release_songs")
  .select("id,track_number")
  .eq("release_id", ALBUM_ID)
  .order("track_number", { ascending: true });
if (rme) { console.log(`  renumber query failed: ${rme.message}`); }
else {
  let i = 1;
  for (const link of rem) {
    if (link.track_number !== i) await supabase.from("release_songs").update({ track_number: i }).eq("id", link.id);
    i++;
  }
  console.log(`\nAlbum now has ${rem.length} tracks, renumbered 1..${rem.length}.`);
}
