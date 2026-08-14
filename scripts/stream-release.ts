/**
 * Build and publish the streaming MP3s for one release.
 *
 * Sibling to pack-release.ts: that one builds what a buyer downloads, this one
 * builds what the site plays. Encodes 256 kbps MP3s from the masters, uploads
 * them to the public music-streaming zone, and writes songs.streaming_path plus
 * songs.duration_seconds on each row.
 *
 * Source layout (same as pack-release.ts):
 *   RECORDS_ROOT/<folder>/<Album> - Chad Lewine (Digital Album)/
 *     NNN-Title-With-Hyphens_Chad-Lewine.wav
 *
 * Local output:
 *   RECORDS_ROOT/<folder>/mp3s for streaming/NN-song-slug.mp3
 *
 * Bunny target: <slug>/NN-song-slug.mp3 in the music-streaming zone.
 * DB: songs.streaming_path gets the full pull-zone URL (public zone).
 *
 * Usage:
 *   npx tsx scripts/stream-release.ts --slug dont-blame-me --folder "012 Don't Blame Me" --dry-run
 *   npx tsx scripts/stream-release.ts --slug dont-blame-me --folder "012 Don't Blame Me"
 *   npx tsx scripts/stream-release.ts --slug dont-blame-me --folder "012 Don't Blame Me" --all
 *
 * Default is missing-only: songs that already have a streaming_path are skipped,
 * so a re-run never clobbers a live file. --all re-encodes and re-uploads every
 * track, which is what you want after a remaster.
 */
import { spawn } from "child_process";
import { createReadStream, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { Readable } from "stream";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });

const RECORDS_ROOT = process.env.RECORDS_ROOT || "D:/RECORDS";
const STORAGE_HOSTNAME = process.env.BUNNY_STORAGE_HOSTNAME || "ny.storage.bunnycdn.com";
const BITRATE = "256k";

interface Track {
  songId: string;
  trackNumber: number;
  title: string;
  slug: string;
  master: string;
  hasStream: boolean;
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function requireEnv(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort();
}

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += String(d)));
    p.stderr.on("data", (d) => (err += String(d)));
    p.on("close", (code) =>
      code === 0
        ? resolve(out.trim())
        : reject(new Error(`${cmd} exited ${code}: ${err.slice(-600)}`)),
    );
  });
}

async function durationSeconds(file: string): Promise<number> {
  const out = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    file,
  ]);
  return Math.round(parseFloat(out));
}

async function encodeStream(
  src: string,
  dst: string,
  meta: { title: string; album: string; track: number; total: number },
): Promise<void> {
  await run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    src,
    "-c:a",
    "libmp3lame",
    "-b:a",
    BITRATE,
    "-map_metadata",
    "-1",
    "-metadata",
    `title=${meta.title}`,
    "-metadata",
    "artist=Chad Lewine",
    "-metadata",
    `album=${meta.album}`,
    "-metadata",
    `track=${meta.track}/${meta.total}`,
    dst,
  ]);
}

// Names already taken in the release's streaming folder on Bunny.
async function remoteNames(zone: string, password: string, dir: string): Promise<Set<string>> {
  const res = await fetch(`https://${STORAGE_HOSTNAME}/${zone}/${dir}/`, {
    headers: { AccessKey: password },
  });
  if (!res.ok) return new Set();
  const rows = (await res.json()) as Array<{ ObjectName: string }>;
  return new Set(rows.map((r) => r.ObjectName));
}

// Re-uploading a name leaves the CDN serving the old bytes: the pull zone caches
// for 30 days, ignores query strings, and there is no account API key here to
// purge with. So a re-render claims the next free name (03-fractals.mp3 ->
// 03-fractals-2.mp3) and the song row is pointed at the new URL. A new name is
// the only reliable way past the cache. The old object is left in place.
function nextFreeName(base: string, ext: string, taken: Set<string>): string {
  if (!taken.has(`${base}.${ext}`)) return `${base}.${ext}`;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}-${n}.${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`No free name for ${base}.${ext}`);
}

async function uploadToBunny(zone: string, password: string, path: string, src: string) {
  const url = `https://${STORAGE_HOSTNAME}/${zone}/${path}`;
  const size = statSync(src).size;
  const body = Readable.toWeb(createReadStream(src)) as unknown as ReadableStream;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      AccessKey: password,
      "Content-Type": "audio/mpeg",
      "Content-Length": String(size),
    },
    // @ts-expect-error duplex is required for a streamed body
    duplex: "half",
    body,
  });
  if (!res.ok) throw new Error(`upload ${path}: ${res.status} ${res.statusText}`);
  return size;
}

async function main() {
  const slug = arg("slug");
  const folder = arg("folder");
  if (!slug || !folder) {
    console.error(
      'Usage: npx tsx scripts/stream-release.ts --slug <release-slug> --folder "<RECORDS folder>" [--all] [--only 1,2,5] [--dry-run]',
    );
    process.exit(1);
  }
  const dryRun = flag("dry-run");
  const all = flag("all");
  const only = (arg("only") || "")
    .split(",")
    .map((n) => parseInt(n.trim(), 10))
    .filter((n) => Number.isFinite(n));

  const releaseDir = join(RECORDS_ROOT, folder);
  const digitalName = readdirSync(releaseDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /\(Digital .*\)$/i.test(e.name))
    .map((e) => e.name)[0];
  if (!digitalName) throw new Error(`No "(Digital ...)" folder inside ${releaseDir}`);
  const digitalDir = join(releaseDir, digitalName);
  const outDir = join(releaseDir, "mp3s for streaming");

  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );

  const { data: release, error: relErr } = await supabase
    .from("releases")
    .select("id, title")
    .eq("slug", slug)
    .single();
  if (relErr || !release) throw new Error(`No release with slug ${slug}`);

  const { data: junction } = await supabase
    .from("release_songs")
    .select("track_number, song_id")
    .eq("release_id", release.id)
    .order("track_number");
  const rows = junction || [];
  if (rows.length === 0) throw new Error(`Release ${slug} has no tracks attached`);

  const { data: songs } = await supabase
    .from("songs")
    .select("id, title, slug, streaming_path")
    .in("id", rows.map((r) => r.song_id));
  const songById = new Map((songs || []).map((s) => [s.id, s]));

  const masters = listFiles(digitalDir).filter((f) => /\.wav$/i.test(f));
  const tracks: Track[] = [];
  for (const r of rows) {
    const s = songById.get(r.song_id);
    if (!s) throw new Error(`Song row missing for track ${r.track_number}`);
    const prefix = String(r.track_number).padStart(3, "0");
    const file = masters.find((m) => m.startsWith(`${prefix}-`));
    if (!file) throw new Error(`No master for track ${prefix} (${s.title})`);
    tracks.push({
      songId: s.id,
      trackNumber: r.track_number,
      title: s.title,
      slug: s.slug,
      master: join(digitalDir, file),
      hasStream: !!s.streaming_path,
    });
  }

  const targets =
    only.length > 0
      ? tracks.filter((t) => only.includes(t.trackNumber))
      : all
        ? tracks
        : tracks.filter((t) => !t.hasStream);
  const zone = requireEnv("BUNNY_STORAGE_ZONE_MUSIC_STREAMING");
  const password = requireEnv("BUNNY_STORAGE_ZONE_MUSIC_STREAMING_PASSWORD");
  const pull = requireEnv("NEXT_PUBLIC_BUNNY_PULL_ZONE_MUSIC_STREAMING").replace(/\/+$/, "");
  const taken = dryRun ? new Set<string>() : await remoteNames(zone, password, slug);

  const mode =
    only.length > 0
      ? `only tracks ${only.join(", ")}`
      : all
        ? "ALL tracks re-rendered"
        : "missing streams only";

  console.log(`Release : ${release.title} (${slug})`);
  console.log(`Masters : ${digitalDir}`);
  console.log(`Mode    : ${mode}`);
  console.log(`Targets : ${targets.length} of ${tracks.length}`);
  for (const t of tracks) {
    const mark = targets.includes(t) ? "->" : "  ";
    console.log(
      `${mark} ${String(t.trackNumber).padStart(2, "0")} ${t.slug}${t.hasStream ? "  (already live)" : ""}`,
    );
  }
  if (targets.length === 0) {
    console.log("\nNothing to do.");
    return;
  }
  if (dryRun) {
    console.log("\n--dry-run: nothing encoded, uploaded, or written.");
    return;
  }

  mkdirSync(outDir, { recursive: true });

  for (const t of targets) {
    const base = `${String(t.trackNumber).padStart(2, "0")}-${t.slug}`;
    const name = nextFreeName(base, "mp3", taken);
    taken.add(name);
    const local = join(outDir, name);
    await encodeStream(t.master, local, {
      title: t.title,
      album: release.title as string,
      track: t.trackNumber,
      total: tracks.length,
    });
    const seconds = await durationSeconds(local);
    const remotePath = `${slug}/${name}`;
    const size = await uploadToBunny(zone, password, remotePath, local);
    const url = `${pull}/${remotePath}`;
    const { error } = await supabase
      .from("songs")
      .update({ streaming_path: url, duration_seconds: seconds })
      .eq("id", t.songId);
    if (error) throw new Error(`db update ${t.slug}: ${error.message}`);
    const renamed = name !== `${base}.mp3` ? "  (new name, past the CDN cache)" : "";
    console.log(
      `  ${name}  ${(size / 1024 / 1024).toFixed(1)} MB  ${seconds}s  uploaded + row updated${renamed}`,
    );
  }

  console.log(`\nDone. ${targets.length} track(s) streaming from ${pull}/${slug}/`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
