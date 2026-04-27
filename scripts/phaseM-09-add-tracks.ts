/**
 * Add 2 songs that had no DB row during the music migration:
 *   - stranded (Demoesque)
 *   - you-make-me-wanna-sped-up (All The Right Places)
 * Plus upload their streaming mp3s.
 */
import { createReadStream, statSync } from "fs";
import { Readable } from "stream";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const HOSTNAME = process.env.BUNNY_STORAGE_HOSTNAME ?? "ny.storage.bunnycdn.com";
const STREAMING_ZONE = process.env.BUNNY_STORAGE_ZONE_MUSIC_STREAMING!;
const STREAMING_PASS = process.env.BUNNY_STORAGE_ZONE_MUSIC_STREAMING_PASSWORD!;
const STREAMING_PULL = process.env.NEXT_PUBLIC_BUNNY_PULL_ZONE_MUSIC_STREAMING!.replace(/\/+$/, "");

type Entry = {
  slug: string;
  title: string;
  albumSlug: string;
  trackNumber: number;
  src: string;
  target: string;
};

const ENTRIES: Entry[] = [
  {
    slug: "stranded",
    title: "Stranded",
    albumSlug: "demoesque",
    trackNumber: 35,
    src: "D:/RECORDS/000 Demoesque/Demoesque_Chad-Lewine_Digital-Compilation_MP3/003-stranded.mp3",
    target: "demoesque/35-stranded.mp3",
  },
  {
    slug: "you-make-me-wanna-sped-up",
    title: "You Make Me Wanna (Sped Up)",
    albumSlug: "all-the-right-places",
    trackNumber: 8,
    src: "D:/RECORDS/006 All The Right Places/mp3s for streaming/07-you-make-me-wanna-sped-up.mp3",
    target: "all-the-right-places/08-you-make-me-wanna-sped-up.mp3",
  },
];

async function putStream(path: string, src: string): Promise<void> {
  const url = `https://${HOSTNAME}/${STREAMING_ZONE}/${path}`;
  const size = statSync(src).size;
  const body = Readable.toWeb(createReadStream(src)) as unknown as ReadableStream;
  const res = await fetch(url, {
    method: "PUT",
    headers: { AccessKey: STREAMING_PASS, "Content-Type": "audio/mpeg", "Content-Length": String(size) },
    // @ts-expect-error duplex required
    duplex: "half",
    body,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
}

async function main() {
  // Resolve album IDs
  const { data: albums, error: aErr } = await supabase.from("albums").select("id,slug").in("slug", ENTRIES.map((e) => e.albumSlug));
  if (aErr) throw aErr;
  const albumIdBySlug = new Map(albums!.map((a) => [a.slug, a.id]));

  for (const e of ENTRIES) {
    const albumId = albumIdBySlug.get(e.albumSlug);
    if (!albumId) throw new Error(`album not found: ${e.albumSlug}`);

    // 1. Upload streaming file
    await putStream(e.target, e.src);
    const streamUrl = `${STREAMING_PULL}/${e.target}`;
    console.log(`  up ${e.target}`);

    // 2. Insert song row
    const { data: song, error: sErr } = await supabase
      .from("songs")
      .insert({
        slug: e.slug,
        title: e.title,
        is_single: false,
        status: "published",
        streaming_path: streamUrl,
      })
      .select("id")
      .single();
    if (sErr) throw sErr;

    // 3. Insert album_songs junction
    const { error: jErr } = await supabase
      .from("album_songs")
      .insert({ album_id: albumId, song_id: song!.id, track_number: e.trackNumber });
    if (jErr) throw jErr;

    console.log(`  db song ${e.slug} (${song!.id.slice(0, 8)}…) ← ${e.albumSlug} track ${e.trackNumber}`);
  }

  console.log(`\nDone. ${ENTRIES.length} songs added.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
