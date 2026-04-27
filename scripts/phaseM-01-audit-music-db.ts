/**
 * Audit current state of albums + songs DB. Categorize every path column
 * by hostname and emit a human-readable report plus a JSON dump for the
 * mapping script.
 */
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { writeFileSync } from "fs";

loadEnv({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type AnyRow = Record<string, unknown>;

function hostnameOf(v: unknown): string {
  if (typeof v !== "string" || !v) return "(null)";
  try {
    return new URL(v).hostname;
  } catch {
    return "(raw-path)";
  }
}

async function main() {
  const { data: albums, error: aErr } = await supabase
    .from("albums")
    .select("id,slug,title,status,release_date,display_order,cover_art_path,cover_art_alt,download_path_mp3,download_path_flac,download_path_wav")
    .order("display_order", { ascending: true });
  if (aErr) throw aErr;

  const { data: songs, error: sErr } = await supabase
    .from("songs")
    .select("id,slug,title,is_single,status,art_image_path,streaming_path,download_path,download_path_mp3,download_path_flac,download_path_wav");
  if (sErr) throw sErr;

  const { data: albumSongs, error: asErr } = await supabase
    .from("album_songs")
    .select("album_id,song_id,track_number");
  if (asErr) throw asErr;

  const albumById = new Map((albums ?? []).map((a: AnyRow) => [a.id, a]));
  const albumIdBySongId = new Map<string, string>();
  const trackNumBySongId = new Map<string, number>();
  for (const as of (albumSongs ?? []) as AnyRow[]) {
    albumIdBySongId.set(as.song_id as string, as.album_id as string);
    trackNumBySongId.set(as.song_id as string, Number(as.track_number ?? 0));
  }

  console.log(`\n=== ALBUMS (${albums?.length ?? 0} rows) ===`);
  for (const a of (albums ?? []) as AnyRow[]) {
    console.log(`  [${String(a.display_order).padStart(3, " ")}] ${a.slug} — "${a.title}" (${a.status})`);
    console.log(`        cover:  ${hostnameOf(a.cover_art_path)} ${a.cover_art_path ? `(${String(a.cover_art_path).slice(0, 90)})` : ""}`);
    console.log(`        mp3:    ${hostnameOf(a.download_path_mp3)}`);
    console.log(`        flac:   ${hostnameOf(a.download_path_flac)}`);
    console.log(`        wav:    ${hostnameOf(a.download_path_wav)}`);
  }

  console.log(`\n=== SONGS (${songs?.length ?? 0} rows) ===`);
  const counts = {
    total: 0,
    stream: new Map<string, number>(),
    mp3: new Map<string, number>(),
    flac: new Map<string, number>(),
    wav: new Map<string, number>(),
    legacy: new Map<string, number>(),
    art: new Map<string, number>(),
  };
  for (const s of (songs ?? []) as AnyRow[]) {
    counts.total++;
    const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
    inc(counts.stream, hostnameOf(s.streaming_path));
    inc(counts.mp3, hostnameOf(s.download_path_mp3));
    inc(counts.flac, hostnameOf(s.download_path_flac));
    inc(counts.wav, hostnameOf(s.download_path_wav));
    inc(counts.legacy, hostnameOf(s.download_path));
    inc(counts.art, hostnameOf(s.art_image_path));
  }
  const fmt = (m: Map<string, number>) => Array.from(m.entries()).map(([k, v]) => `${k}=${v}`).join("  ");
  console.log(`  total=${counts.total}`);
  console.log(`  streaming_path:      ${fmt(counts.stream)}`);
  console.log(`  download_path_mp3:   ${fmt(counts.mp3)}`);
  console.log(`  download_path_flac:  ${fmt(counts.flac)}`);
  console.log(`  download_path_wav:   ${fmt(counts.wav)}`);
  console.log(`  download_path (leg): ${fmt(counts.legacy)}`);
  console.log(`  art_image_path:      ${fmt(counts.art)}`);

  const singles = ((songs ?? []) as AnyRow[]).filter((s) => s.is_single);
  console.log(`\n=== SINGLES (${singles.length}) ===`);
  for (const s of singles) {
    const ownerId = albumIdBySongId.get(s.id as string);
    const albumTitle = ownerId ? (albumById.get(ownerId) as AnyRow | undefined)?.title ?? "?" : "(no album)";
    console.log(`  ${s.slug} — "${s.title}" ← ${albumTitle} (${s.status})`);
    console.log(`      stream: ${hostnameOf(s.streaming_path)}`);
    console.log(`      mp3:    ${hostnameOf(s.download_path_mp3)}  ${s.download_path_mp3 ? String(s.download_path_mp3).slice(0, 90) : ""}`);
    console.log(`      flac:   ${hostnameOf(s.download_path_flac)}`);
    console.log(`      wav:    ${hostnameOf(s.download_path_wav)}`);
    console.log(`      legacy: ${hostnameOf(s.download_path)}`);
  }

  console.log(`\n=== SONGS PER ALBUM ===`);
  for (const a of (albums ?? []) as AnyRow[]) {
    const tracks = ((songs ?? []) as AnyRow[])
      .filter((s) => albumIdBySongId.get(s.id as string) === a.id)
      .map((s) => ({ ...s, track_number: trackNumBySongId.get(s.id as string) ?? 0 }))
      .sort((x, y) => Number(x.track_number ?? 0) - Number(y.track_number ?? 0));
    console.log(`  ${a.slug} (${tracks.length} tracks)`);
    for (const t of tracks) {
      console.log(`    ${String(t.track_number).padStart(2, " ")}. ${t.slug} — "${t.title}" [stream:${hostnameOf(t.streaming_path)}]`);
    }
  }

  const unassigned = ((songs ?? []) as AnyRow[]).filter((s) => !albumIdBySongId.has(s.id as string));
  console.log(`\n=== UNASSIGNED SONGS (no album_songs row) (${unassigned.length}) ===`);
  for (const s of unassigned) {
    console.log(`  ${s.slug} — "${s.title}" single=${s.is_single} (${s.status})`);
  }

  writeFileSync(
    "scripts/phaseM-01-audit-music-db.out.json",
    JSON.stringify({ albums, songs, album_songs: albumSongs }, null, 2)
  );
  console.log(`\nWrote scripts/phaseM-01-audit-music-db.out.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
