/**
 * Upload per-song MP3/FLAC/WAV from D:\RECORDS into Bunny music-downloads
 * zone, then write download_path_mp3/flac/wav on each matching song row.
 *
 * Source layout per album folder (e.g. D:\RECORDS\001 The Human Link\):
 *   *_MP3.zip   — contains "<NNN> <Title>.mp3" entries inside one parent dir
 *   *_FLAC.zip  — same, .flac
 *   *_WAV.zip   — same, .wav
 *
 * Single-folder layout (no zips, e.g. D:\RECORDS\009B 35\):
 *   *.mp3, *.flac, *.wav loose at the album root. Each matches the album's
 *   single song.
 *
 * Bunny target path: songs/<song-slug>/<sanitized-original-filename>
 * DB column: songs.download_path_{mp3,flac,wav}
 *
 * Usage:
 *   npx tsx scripts/upload-album-downloads.ts --album "001 The Human Link" --dry-run
 *   npx tsx scripts/upload-album-downloads.ts --album "001 The Human Link"
 *   npx tsx scripts/upload-album-downloads.ts --album "001 The Human Link" --force
 *   npx tsx scripts/upload-album-downloads.ts --album "001 The Human Link" --formats mp3
 *
 * Standalone-single mode (no album row in DB; loose files map to one song):
 *   npx tsx scripts/upload-album-downloads.ts --album "008B Boomerang" --song boomerang --dry-run
 */
import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "fs";
import { basename, join } from "path";
import { Readable } from "stream";
import { execFileSync } from "child_process";
import { tmpdir } from "os";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const STORAGE_HOSTNAME =
  process.env.BUNNY_STORAGE_HOSTNAME ?? "ny.storage.bunnycdn.com";

const supabase = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
);

const BUNNY = {
  zone: requireEnv("BUNNY_STORAGE_ZONE_MUSIC_DOWNLOADS"),
  password: requireEnv("BUNNY_STORAGE_ZONE_MUSIC_DOWNLOADS_PASSWORD"),
};

const RECORDS_ROOT = "D:\\RECORDS";

type Format = "mp3" | "flac" | "wav";
const ALL_FORMATS: Format[] = ["mp3", "flac", "wav"];

function requireEnv(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

// Mirror src/app/api/admin/media/upload/route.ts sanitizeBasename:
// only collapse separators and whitespace; preserve case and other chars.
function sanitizeBasename(name: string): string {
  return name.replace(/[/\\]/g, "-").replace(/\s+/g, "-");
}

function mimeOf(format: Format): string {
  if (format === "mp3") return "audio/mpeg";
  if (format === "flac") return "audio/flac";
  return "audio/wav";
}

function bunnyUrl(path: string): string {
  return `https://${STORAGE_HOSTNAME}/${BUNNY.zone}/${path.replace(/^\/+/, "")}`;
}

async function bunnyHead(path: string, expectedSize: number): Promise<boolean> {
  const res = await fetch(bunnyUrl(path), {
    method: "HEAD",
    headers: { AccessKey: BUNNY.password },
  });
  if (res.status === 404) return false;
  if (!res.ok) return false;
  const cl = Number(res.headers.get("Content-Length") ?? 0);
  return expectedSize >= 0 && cl === expectedSize;
}

async function bunnyPut(path: string, src: string, format: Format): Promise<void> {
  const stat = statSync(src);
  const stream = Readable.toWeb(createReadStream(src)) as unknown as ReadableStream;
  const res = await fetch(bunnyUrl(path), {
    method: "PUT",
    headers: {
      AccessKey: BUNNY.password,
      "Content-Type": mimeOf(format),
      "Content-Length": String(stat.size),
    },
    // @ts-expect-error: duplex required for stream body on node fetch
    duplex: "half",
    body: stream,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} - ${text.slice(0, 200)}`);
  }
}

type AlbumSong = {
  songId: string;
  songSlug: string;
  songTitle: string;
  trackNumber: number;
  existing: Record<Format, string | null>;
};

async function loadSingleSong(songSlug: string): Promise<{ albumId: string; albumTitle: string; songs: AlbumSong[] }> {
  const { data: rows, error } = await supabase
    .from("songs")
    .select("id, title, slug, download_path_mp3, download_path_flac, download_path_wav")
    .eq("slug", songSlug)
    .limit(1);
  if (error) throw error;
  if (!rows || rows.length === 0) throw new Error(`No song with slug "${songSlug}"`);
  const s = rows[0];
  return {
    albumId: "(none - standalone single)",
    albumTitle: `(single: ${s.title})`,
    songs: [
      {
        songId: s.id,
        songSlug: s.slug,
        songTitle: s.title,
        trackNumber: 1,
        existing: {
          mp3: s.download_path_mp3,
          flac: s.download_path_flac,
          wav: s.download_path_wav,
        },
      },
    ],
  };
}

async function loadAlbumSongs(
  albumFolder: string,
  albumSlugOverride: string | null,
): Promise<{ albumId: string; albumTitle: string; songs: AlbumSong[] }> {
  let album: { id: string; title: string } | null = null;
  if (albumSlugOverride) {
    const { data, error } = await supabase
      .from("albums")
      .select("id, title")
      .eq("slug", albumSlugOverride)
      .limit(1);
    if (error) throw error;
    if (!data || data.length === 0) throw new Error(`No album with slug "${albumSlugOverride}"`);
    album = data[0];
  } else {
    // Strip leading order prefix like "001 " or "009B " from folder name.
    const titleGuess = albumFolder.replace(/^\d{1,4}[A-Z]?\s+/, "").trim();
    const { data: albums, error: aErr } = await supabase
      .from("albums")
      .select("id, title")
      .ilike("title", titleGuess)
      .limit(2);
    if (aErr) throw aErr;
    if (!albums || albums.length === 0) {
      // Try fuzzy
      const { data: fuzzy, error: fErr } = await supabase
        .from("albums")
        .select("id, title")
        .ilike("title", `%${titleGuess}%`);
      if (fErr) throw fErr;
      if (!fuzzy || fuzzy.length === 0) {
        throw new Error(`No album matched "${titleGuess}" (from "${albumFolder}"). Try --album-slug.`);
      }
      if (fuzzy.length > 1) {
        throw new Error(`Multiple albums matched "${titleGuess}": ${fuzzy.map((a) => a.title).join(", ")}. Use --album-slug.`);
      }
      albums.push(fuzzy[0]);
    }
    album = albums[0];
  }

  const { data: rows, error: rErr } = await supabase
    .from("album_songs")
    .select(
      "track_number, songs(id, title, slug, download_path_mp3, download_path_flac, download_path_wav)",
    )
    .eq("album_id", album.id)
    .order("track_number");
  if (rErr) throw rErr;
  if (!rows) throw new Error(`No songs for album ${album.title}`);

  const songs: AlbumSong[] = rows.map((r) => {
    type SongRow = {
      id: string;
      title: string;
      slug: string;
      download_path_mp3: string | null;
      download_path_flac: string | null;
      download_path_wav: string | null;
    };
    const s = r.songs as unknown as SongRow;
    return {
      songId: s.id,
      songSlug: s.slug,
      songTitle: s.title,
      trackNumber: r.track_number,
      existing: {
        mp3: s.download_path_mp3,
        flac: s.download_path_flac,
        wav: s.download_path_wav,
      },
    };
  });
  return { albumId: album.id, albumTitle: album.title, songs };
}

function findZipsInFolder(folder: string): Partial<Record<Format, string>> {
  const out: Partial<Record<Format, string>> = {};
  for (const name of readdirSync(folder)) {
    const lower = name.toLowerCase();
    if (!lower.endsWith(".zip")) continue;
    const full = join(folder, name);
    if (lower.includes("_mp3.zip") || lower.endsWith("-mp3.zip")) out.mp3 = full;
    else if (lower.includes("_flac.zip") || lower.endsWith("-flac.zip")) out.flac = full;
    else if (lower.includes("_wav.zip") || lower.endsWith("-wav.zip")) out.wav = full;
  }
  return out;
}

function findLooseFiles(folder: string): Partial<Record<Format, string>> {
  const out: Partial<Record<Format, string>> = {};
  for (const name of readdirSync(folder)) {
    const lower = name.toLowerCase();
    const full = join(folder, name);
    if (lower.endsWith(".mp3") && !out.mp3) out.mp3 = full;
    else if (lower.endsWith(".flac") && !out.flac) out.flac = full;
    else if (lower.endsWith(".wav") && !out.wav) out.wav = full;
  }
  return out;
}

function extractZip(zipPath: string, destDir: string): string[] {
  // Use bundled `tar` (Windows 10+ has tar.exe which understands zip).
  // Falls back to PowerShell Expand-Archive if needed.
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
  try {
    execFileSync("tar", ["-xf", zipPath, "-C", destDir], { stdio: "ignore" });
  } catch {
    execFileSync(
      "powershell",
      ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destDir}' -Force`],
      { stdio: "ignore" },
    );
  }
  // Walk and return audio file paths.
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, name.name);
      if (name.isDirectory()) walk(full);
      else if (/\.(mp3|flac|wav)$/i.test(name.name)) out.push(full);
    }
  };
  walk(destDir);
  return out;
}

function trackNumFromFilename(name: string): number | null {
  const m = basename(name).match(/^(\d{1,4})\b/);
  if (!m) return null;
  return parseInt(m[1], 10);
}

// Slugify a string the way the app does (lowercase, alnum-or-hyphen),
// for filename-title -> song-slug fallback matching.
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Strip leading track number, trailing extension, parent path, and any
// "(Original 2014 Version)" / "(Sped Up)" style suffixes. Returns slug.
function titleSlugFromFilename(filePath: string): string {
  let name = basename(filePath).replace(/\.(mp3|flac|wav)$/i, "");
  name = name.replace(/^\d{1,4}[\s_-]+/, "");
  // Drop the all-caps "HIDDEN TRACK -" prefix if present.
  name = name.replace(/^HIDDEN\s+TRACK\s*[-:]\s*/i, "");
  return slugify(name);
}

type Plan = {
  format: Format;
  source: string;
  sourceBytes: number;
  songId: string;
  songSlug: string;
  songTitle: string;
  trackNumber: number;
  targetPath: string;
  existingValue: string | null;
};

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const albumIdx = args.indexOf("--album");
  if (albumIdx < 0) throw new Error("--album <records-folder-name> is required");
  const albumFolderName = args[albumIdx + 1];
  const formatsIdx = args.indexOf("--formats");
  const formats: Format[] = formatsIdx >= 0
    ? (args[formatsIdx + 1].split(",") as Format[])
    : ALL_FORMATS;
  const songIdx = args.indexOf("--song");
  const songSlugArg = songIdx >= 0 ? args[songIdx + 1] : null;
  const albumSlugIdx = args.indexOf("--album-slug");
  const albumSlugArg = albumSlugIdx >= 0 ? args[albumSlugIdx + 1] : null;

  const albumFolder = join(RECORDS_ROOT, albumFolderName);
  if (!existsSync(albumFolder)) throw new Error(`Album folder not found: ${albumFolder}`);

  console.log(`\n=== ALBUM: ${albumFolderName} ===`);
  console.log(`  Dry-run: ${dryRun}   Force: ${force}   Formats: ${formats.join(",")}`);

  const { albumId, albumTitle, songs } = songSlugArg
    ? await loadSingleSong(songSlugArg)
    : await loadAlbumSongs(albumFolderName, albumSlugArg);
  console.log(`  Album in DB: ${albumTitle} (${albumId})`);
  console.log(`  Songs in DB: ${songs.length}`);

  // Locate sources for each format: zip first, else loose files.
  const zips = findZipsInFolder(albumFolder);
  const loose = findLooseFiles(albumFolder);

  // Map: format -> list of source files (with path + track number)
  const filesByFormat: Record<Format, { src: string; track: number | null }[]> = {
    mp3: [],
    flac: [],
    wav: [],
  };

  // Per-album tmp dir
  const tmp = join(tmpdir(), `cl-bulk-${Date.now()}`);
  const cleanup: string[] = [];

  for (const format of formats) {
    const zip = zips[format];
    if (zip) {
      const subDir = join(tmp, format);
      cleanup.push(subDir);
      const extracted = extractZip(zip, subDir).filter((f) => f.toLowerCase().endsWith(`.${format}`));
      for (const f of extracted) {
        const t = trackNumFromFilename(f);
        filesByFormat[format].push({ src: f, track: t });
      }
      continue;
    }
    const looseFile = loose[format];
    if (looseFile) {
      // Single loose file - assign to track 1 if album has exactly one song,
      // else require leading track number.
      const t = trackNumFromFilename(looseFile);
      filesByFormat[format].push({
        src: looseFile,
        track: t ?? (songs.length === 1 ? 1 : null),
      });
    }
  }

  // Build plan: for each (format, song) pick the file with matching track,
  // falling back to title-slug match (filename's title -> song.slug) when
  // numbering diverges (e.g. demos inserted, hidden tracks, reordered EPs).
  const plan: Plan[] = [];
  const skips: string[] = [];
  const usedSrcByFormat: Record<Format, Set<string>> = {
    mp3: new Set(),
    flac: new Set(),
    wav: new Set(),
  };
  for (const format of formats) {
    const files = filesByFormat[format];
    if (files.length === 0) {
      skips.push(`No ${format.toUpperCase()} source for album.`);
      continue;
    }
    // Pass 1: title-slug matches (more reliable when track numbers drift).
    // Pass 2: track-number matches for the remainder.
    const matched = new Map<string, { src: string; track: number | null; matchedBy: string }>();
    for (const song of songs) {
      const f = files.find(
        (x) => titleSlugFromFilename(x.src) === song.songSlug && !usedSrcByFormat[format].has(x.src),
      );
      if (f) {
        matched.set(song.songSlug, { ...f, matchedBy: "title" });
        usedSrcByFormat[format].add(f.src);
      }
    }
    for (const song of songs) {
      if (matched.has(song.songSlug)) continue;
      const f = files.find(
        (x) => x.track === song.trackNumber && !usedSrcByFormat[format].has(x.src),
      );
      if (f) {
        matched.set(song.songSlug, { ...f, matchedBy: "track" });
        usedSrcByFormat[format].add(f.src);
      }
    }
    for (const song of songs) {
      const file = matched.get(song.songSlug);
      if (!file) {
        skips.push(`[${format}] track ${song.trackNumber} (${song.songSlug}) - no matching source file.`);
        continue;
      }
      if (file.matchedBy === "title") {
        console.log(`  (matched by title) [${format}] ${song.songSlug} <- ${basename(file.src)}`);
      }
      const filename = sanitizeBasename(basename(file.src));
      const targetPath = `songs/${song.songSlug}/${filename}`;
      plan.push({
        format,
        source: file.src,
        sourceBytes: statSync(file.src).size,
        songId: song.songId,
        songSlug: song.songSlug,
        songTitle: song.songTitle,
        trackNumber: song.trackNumber,
        targetPath,
        existingValue: song.existing[format],
      });
    }
  }

  console.log(`\n  Plan: ${plan.length} files. Skips: ${skips.length}`);
  if (skips.length > 0) {
    for (const s of skips) console.log(`    SKIP: ${s}`);
  }

  console.log("");
  for (const p of plan) {
    const overwriteNote = p.existingValue
      ? force
        ? "  (will OVERWRITE existing)"
        : "  (existing - SKIP unless --force)"
      : "";
    console.log(
      `  [${p.format}] t${String(p.trackNumber).padStart(2, "0")} ${p.songSlug.padEnd(28)} ${fmtSize(p.sourceBytes).padStart(8)}  -> ${p.targetPath}${overwriteNote}`,
    );
  }

  if (dryRun) {
    console.log("\n(dry-run - no uploads, no DB writes)");
    cleanupTmp(cleanup);
    return;
  }

  let uploaded = 0;
  let dbUpdated = 0;
  let skippedExisting = 0;
  let skippedAlreadyOnBunny = 0;
  let failed = 0;
  const started = Date.now();

  for (const p of plan) {
    const label = `[${p.format}] ${p.songSlug}/${basename(p.targetPath)}`;
    try {
      if (p.existingValue && !force) {
        skippedExisting++;
        console.log(`  SKIP ${label}  (DB already set: ${p.existingValue})`);
        continue;
      }
      const onBunny = await bunnyHead(p.targetPath, p.sourceBytes);
      if (!onBunny) {
        const t = Date.now();
        await bunnyPut(p.targetPath, p.source, p.format);
        const elapsed = (Date.now() - t) / 1000;
        const mbs = p.sourceBytes / 1024 / 1024 / elapsed;
        uploaded++;
        console.log(`  UP   ${label}  (${fmtSize(p.sourceBytes)} in ${elapsed.toFixed(1)}s, ${mbs.toFixed(1)} MB/s)`);
      } else {
        skippedAlreadyOnBunny++;
        console.log(`  ON-BUNNY ${label}  (matching size)`);
      }
      // Update DB
      const col = `download_path_${p.format}`;
      const { error: uErr } = await supabase
        .from("songs")
        .update({ [col]: p.targetPath })
        .eq("id", p.songId);
      if (uErr) throw uErr;
      dbUpdated++;
    } catch (err) {
      failed++;
      console.log(`  FAIL ${label} - ${(err as Error).message}`);
    }
  }

  const total = (Date.now() - started) / 1000;
  console.log(`\n=== DONE: ${albumTitle} ===`);
  console.log(`  uploaded:               ${uploaded}`);
  console.log(`  on-bunny (size match):  ${skippedAlreadyOnBunny}`);
  console.log(`  skipped (db already):   ${skippedExisting}`);
  console.log(`  db rows updated:        ${dbUpdated}`);
  console.log(`  failed:                 ${failed}`);
  console.log(`  total:                  ${total.toFixed(1)}s`);

  cleanupTmp(cleanup);
  if (failed > 0) process.exit(1);
}

function cleanupTmp(dirs: string[]) {
  for (const d of dirs) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
