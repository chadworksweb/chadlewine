/**
 * Build the download packs for one release, straight from its masters.
 *
 * Replaces the per-album hardcoding in phaseM-03-repack.ts for anything new:
 * that script rebuilt the migration-era catalog by extracting each release's
 * pre-existing ZIP, so it cannot pack a release that never had one. This reads
 * the tracklist from the database and encodes every format from the masters.
 *
 * Expected layout under RECORDS_ROOT/<folder>/:
 *   <Album> - Chad Lewine (Digital Album)/
 *     NNN-Title-With-Hyphens_Chad-Lewine.wav     (one per track, NNN = track no)
 *     <Album>_Chad-Lewine_album-cover-art.jpg    (full-res, loose in the pack)
 *     bonus art/                                 (optional, copied in whole)
 *   _cover-embed-1500.jpg                        (optional smaller embed copy)
 *
 * Formats:
 *   wav  - master copied, RIFF INFO tags written, no embedded art (ID3-in-WAV
 *          is patchy; the loose cover in the folder is the standard)
 *   flac - lossless from the master, art attached
 *   mp3  - 320 kbps, art attached
 *   aac  - 256 kbps in an .m4a MP4 container, art attached per file. This is
 *          the pack that drags into iTunes / Music.app as one clean album, so
 *          album + album_artist must be identical across every track or the
 *          library splits the release in two.
 *
 * Usage:
 *   npx tsx scripts/pack-release.ts --slug dont-blame-me --folder "012 Don't Blame Me" --dry-run
 *   npx tsx scripts/pack-release.ts --slug dont-blame-me --folder "012 Don't Blame Me"
 *   npx tsx scripts/pack-release.ts --slug dont-blame-me --folder "012 Don't Blame Me" --formats aac
 *
 * Output (staged, never overwrites the source folder):
 *   D:/RECORDS/_repack_output/albums/<slug>/<Zip-Prefix>_<FORMAT>.zip
 */
import { spawn } from "child_process";
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from "fs";
import { join } from "path";
import archiver from "archiver";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });

const RECORDS_ROOT = process.env.RECORDS_ROOT || "D:/RECORDS";
const STAGING = join(RECORDS_ROOT, "_repack_staging");
const OUTPUT = join(RECORDS_ROOT, "_repack_output");

const ALL_FORMATS = ["mp3", "flac", "wav", "aac"] as const;
type Format = (typeof ALL_FORMATS)[number];

const EXT: Record<Format, string> = {
  mp3: "mp3",
  flac: "flac",
  wav: "wav",
  aac: "m4a",
};

interface Track {
  trackNumber: number;
  title: string;
  master: string;
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

function ensureDir(d: string) {
  mkdirSync(d, { recursive: true });
}

function rmIfExists(p: string) {
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => e.name)
    .sort();
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Windows forbids \ / : * ? " < > | in filenames. Apostrophes and spaces are
// fine and stay, because these are the names the buyer reads.
function safeTrackFilename(n: number, title: string, ext: string): string {
  const clean = title.replace(/[\\/:*?"<>|]/g, "-").trim();
  return `${String(n).padStart(3, "0")} ${clean}.${ext}`;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += String(d)));
    p.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${cmd} exited ${code}: ${err.slice(-600)}`)),
    );
  });
}

async function encode(
  fmt: Format,
  src: string,
  art: string,
  dst: string,
  meta: {
    title: string;
    album: string;
    track: number;
    total: number;
    year: string | null;
    genre: string | null;
  },
): Promise<void> {
  const tags = [
    "-metadata",
    `title=${meta.title}`,
    "-metadata",
    "artist=Chad Lewine",
    "-metadata",
    "album_artist=Chad Lewine",
    "-metadata",
    `album=${meta.album}`,
    "-metadata",
    `track=${meta.track}/${meta.total}`,
    "-metadata",
    "disc=1/1",
  ];
  if (meta.year) tags.push("-metadata", `date=${meta.year}`);
  if (meta.genre) tags.push("-metadata", `genre=${meta.genre}`);

  if (fmt === "wav") {
    // Audio bytes untouched; RIFF INFO tags only. Windows Explorer shows these
    // columns blank no matter what, which is a shell limitation, not a failure.
    await run("ffmpeg", ["-v", "error", "-y", "-i", src, "-c", "copy", ...tags, dst]);
    return;
  }

  const codec: string[] =
    fmt === "flac"
      ? ["-c:a", "flac"]
      : fmt === "mp3"
        ? ["-c:a", "libmp3lame", "-b:a", "320k"]
        : ["-c:a", "aac", "-b:a", "256k"];

  // Cover stream. MP3 wants the ID3 APIC comment; FLAC and MP4 want the
  // attached_pic disposition. MP4 also gets faststart so the atom order is
  // right for players that stream the file.
  const artArgs: string[] =
    fmt === "mp3"
      ? [
          "-c:v",
          "copy",
          "-id3v2_version",
          "3",
          "-metadata:s:v",
          "title=Album cover",
          "-metadata:s:v",
          "comment=Cover (front)",
        ]
      : fmt === "flac"
        ? ["-c:v", "copy", "-disposition:v", "attached_pic"]
        : ["-c:v", "mjpeg", "-disposition:v", "attached_pic", "-movflags", "+faststart"];

  await run("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    src,
    "-i",
    art,
    "-map",
    "0:a",
    "-map",
    "1:v",
    ...codec,
    ...artArgs,
    ...tags,
    dst,
  ]);
}

function zipFolder(srcDir: string, outZip: string, internalRoot: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ensureDir(join(outZip, ".."));
    const out = createWriteStream(outZip);
    const archive = archiver("zip", { zlib: { level: 6 } });
    out.on("close", () => resolve(archive.pointer()));
    archive.on("error", reject);
    archive.pipe(out);
    archive.directory(srcDir, internalRoot);
    archive.finalize();
  });
}

async function loadTracklist(slug: string): Promise<{
  album: string;
  year: string | null;
  tracks: Array<{ trackNumber: number; title: string }>;
}> {
  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );

  const { data: release, error } = await supabase
    .from("releases")
    .select("id, title, release_date")
    .eq("slug", slug)
    .single();
  if (error || !release) throw new Error(`No release with slug ${slug}`);

  const { data: junction } = await supabase
    .from("release_songs")
    .select("track_number, song_id")
    .eq("release_id", release.id)
    .order("track_number");
  const rows = junction || [];
  if (rows.length === 0) throw new Error(`Release ${slug} has no tracks attached`);

  const { data: songs } = await supabase
    .from("songs")
    .select("id, title")
    .in("id", rows.map((r) => r.song_id));
  const titleById = new Map((songs || []).map((s) => [s.id, s.title as string]));

  return {
    album: release.title as string,
    year: release.release_date ? String(release.release_date).slice(0, 4) : null,
    tracks: rows.map((r) => ({
      trackNumber: r.track_number as number,
      title: titleById.get(r.song_id) || `Track ${r.track_number}`,
    })),
  };
}

async function main() {
  const slug = arg("slug");
  const folder = arg("folder");
  if (!slug || !folder) {
    console.error(
      'Usage: npx tsx scripts/pack-release.ts --slug <release-slug> --folder "<RECORDS folder>" [--formats mp3,flac,wav,aac] [--genre "..."] [--year 2026] [--dry-run]',
    );
    process.exit(1);
  }

  const dryRun = flag("dry-run");
  const genre = arg("genre");
  const formats: Format[] = (arg("formats") || ALL_FORMATS.join(","))
    .split(",")
    .map((f) => f.trim().toLowerCase())
    .filter((f): f is Format => (ALL_FORMATS as readonly string[]).includes(f));
  if (formats.length === 0) throw new Error("No valid formats requested");

  const releaseDir = join(RECORDS_ROOT, folder);
  if (!existsSync(releaseDir)) throw new Error(`No such folder: ${releaseDir}`);

  const digitalName = readdirSync(releaseDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /\(Digital .*\)$/i.test(e.name))
    .map((e) => e.name)[0];
  if (!digitalName) {
    throw new Error(`No "(Digital ...)" folder inside ${releaseDir}`);
  }
  const digitalDir = join(releaseDir, digitalName);

  const coverName = listFiles(digitalDir).find((f) => /album-cover-art\.(jpg|jpeg|png)$/i.test(f));
  if (!coverName) throw new Error(`No *_album-cover-art.jpg in ${digitalDir}`);
  const coverFile = join(digitalDir, coverName);

  // Smaller copy for embedding, so 11 tracks do not each carry a print-res JPEG.
  const embedCandidate = join(releaseDir, "_cover-embed-1500.jpg");
  const embedArt = existsSync(embedCandidate) ? embedCandidate : coverFile;

  const bonusDir = join(digitalDir, "bonus art");
  const meta = await loadTracklist(slug);
  const year = arg("year") || meta.year;

  // Match each DB track to its master by the NNN- prefix.
  const masters = listFiles(digitalDir).filter((f) => /\.wav$/i.test(f));
  const tracks: Track[] = [];
  const missing: string[] = [];
  for (const t of meta.tracks) {
    const prefix = String(t.trackNumber).padStart(3, "0");
    const file = masters.find((m) => m.startsWith(`${prefix}-`));
    if (!file) {
      missing.push(`${prefix} ${t.title}`);
      continue;
    }
    tracks.push({ trackNumber: t.trackNumber, title: t.title, master: join(digitalDir, file) });
  }

  // Apostrophes drop out rather than becoming hyphens, matching the existing
  // catalog ("Can't Stop Us Now" ships as Cant-Stop-Us-Now).
  const zipPrefix = `${meta.album
    .replace(/['\u2019]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}_Chad-Lewine_Digital-Album`;

  console.log(`Release  : ${meta.album} (${slug})`);
  console.log(`Folder   : ${digitalDir}`);
  console.log(`Cover    : ${coverName} (embed: ${embedArt === coverFile ? "same" : "_cover-embed-1500.jpg"})`);
  console.log(`Year     : ${year ?? "none"}${genre ? `  Genre: ${genre}` : ""}`);
  console.log(`Formats  : ${formats.join(", ")}`);
  console.log(`Tracks   : ${tracks.length} of ${meta.tracks.length}`);
  for (const t of tracks) {
    console.log(`  ${String(t.trackNumber).padStart(3, "0")}  ${t.title}`);
  }
  if (missing.length > 0) {
    console.log(`  MISSING MASTERS: ${missing.join(", ")}`);
    throw new Error("Every track needs a master before packing");
  }
  if (dryRun) {
    console.log("\n--dry-run: nothing written.");
    return;
  }

  for (const fmt of formats) {
    const stageRoot = join(STAGING, slug, fmt);
    rmIfExists(stageRoot);
    const internal = join(stageRoot, digitalName);
    ensureDir(internal);

    process.stdout.write(`\n[${fmt}] encoding ${tracks.length} tracks`);
    for (const t of tracks) {
      const dst = join(internal, safeTrackFilename(t.trackNumber, t.title, EXT[fmt]));
      await encode(fmt, t.master, embedArt, dst, {
        title: t.title,
        album: meta.album,
        track: t.trackNumber,
        total: tracks.length,
        year,
        genre,
      });
      process.stdout.write(".");
    }
    process.stdout.write("\n");

    // Loose extras: the full-res cover at the pack root, plus bonus art.
    copyFileSync(coverFile, join(internal, coverName));
    if (existsSync(bonusDir)) {
      const destBonus = join(internal, "bonus art");
      ensureDir(destBonus);
      for (const f of listFiles(bonusDir)) copyFileSync(join(bonusDir, f), join(destBonus, f));
    }

    const outZip = join(OUTPUT, "albums", slug, `${zipPrefix}_${fmt.toUpperCase()}.zip`);
    rmIfExists(outZip);
    const size = await zipFolder(internal, outZip, digitalName);
    console.log(`[${fmt}] ${outZip} (${mb(size)})`);
    rmIfExists(stageRoot);
  }

  console.log(`\nDone. Packs staged in ${join(OUTPUT, "albums", slug)}`);
  console.log("Nothing was uploaded and no database row was touched.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
