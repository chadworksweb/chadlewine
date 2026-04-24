/**
 * Build a source-to-target mapping for the D:\RECORDS → chadlewine Bunny migration.
 *
 * Input:  scripts/phaseM-01-audit-music-db.out.json  (albums, songs, album_songs)
 * Output: scripts/phaseM-02-mapping.out.json         (reviewable plan)
 *         plus human-readable report on stdout
 *
 * Rules (per session decisions):
 *   - Albums 000–011: upload cover + all available ZIP formats + streaming for every track
 *   - 012 Don't Blame Me: only 3 released songs (dont-blame-me-track, turn-the-mill,
 *     johnny-boy) — streaming from singles/mp3s for streaming/orphaned singles/*,
 *     per-format downloads from singles/{Dont-Blame-Me|Turn-The-Mill|Johnny-Boy}/*.
 *     No cover, no album ZIPs for 012.
 *   - 6 DB singles: streaming + per-format downloads from singles/{slug}/
 *     and singles/mp3s for streaming/ (choose-lit from orphaned singles/)
 *   - Skip 0000 The Secret (Mixtape), skip per-song art, skip back-office folders
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { extname, join } from "path";

const RECORDS_ROOT = "D:/RECORDS";
const REPACK_OUTPUT = "D:/RECORDS/_repack_output";
const AUDIT = JSON.parse(readFileSync("scripts/phaseM-01-audit-music-db.out.json", "utf8")) as {
  albums: Album[];
  songs: Song[];
  album_songs: AlbumSong[];
};

type Album = {
  id: string;
  slug: string;
  title: string;
  status: string;
  display_order: number;
  cover_art_path: string | null;
};
type Song = {
  id: string;
  slug: string;
  title: string;
  is_single: boolean;
  status: string;
  streaming_path: string | null;
  download_path: string | null;
  download_path_mp3: string | null;
  download_path_flac: string | null;
  download_path_wav: string | null;
};
type AlbumSong = { album_id: string; song_id: string; track_number: number };

type MappingEntry = {
  source: string; // absolute disk path
  sourceBytes: number;
  zone: "cover-art" | "music-streaming" | "music-downloads";
  targetPath: string; // relative path within the zone
  target:
    | { kind: "album"; albumId: string; albumSlug: string; column: "cover_art_path" | "download_path_mp3" | "download_path_flac" | "download_path_wav" }
    | { kind: "song"; songId: string; songSlug: string; albumSlug: string | null; column: "streaming_path" | "download_path_mp3" | "download_path_flac" | "download_path_wav" };
  note?: string;
};

// Album folder on disk (NN name) → DB album slug
const ALBUM_FOLDER_MAP: Record<string, string> = {
  "000 Demoesque": "demoesque",
  "001 The Human Link": "the-human-link",
  "002 Williamsburgadelphia": "williamsburgadelphia",
  "003 Life as as Student": "life-as-a-student", // note typo on disk
  "004 HoneyChrome": "honeychrome",
  "005 Daylight Animal": "daylight-animal",
  "006 All The Right Places": "all-the-right-places",
  "007 Sprout": "sprout",
  "008 Feeling High": "feeling-high",
  "009 The Gap": "the-gap",
  "010 Pivotal Days": "pivotal-days",
  "011 HYPERISING": "hyperising",
};
// NOTE: 0000 Mixtape + 012 Don't Blame Me (album-level) intentionally excluded.

// Manual streaming-mp3 filename → song slug overrides (where fuzzy matching fails).
// Key: path relative to RECORDS_ROOT, forward slashes.
const STREAMING_OVERRIDES: Record<string, string> = {
  // 001 The Human Link
  "001 The Human Link/mp3s for streaming/007-tga.mp3": "t-g-a-the-gay-anthem",
  "001 The Human Link/mp3s for streaming/008-ask-and-tell.mp3": "ask-tell",
  // 000 Demoesque
  "000 Demoesque/Demoesque_Chad-Lewine_Digital-Compilation_MP3/001-comin-to-get-ya.mp3": "coming-to-get-ya",
  "000 Demoesque/Demoesque_Chad-Lewine_Digital-Compilation_MP3/015-life-is-a-ride-CLUB.mp3": "life-is-a-ride-demo-remix",
  "000 Demoesque/Demoesque_Chad-Lewine_Digital-Compilation_MP3/023-ask-and-tell-demo.mp3": "ask-tell-demo",
  "000 Demoesque/Demoesque_Chad-Lewine_Digital-Compilation_MP3/024-Gay-Anthem-demo.mp3": "t-g-a-demo",
  "000 Demoesque/Demoesque_Chad-Lewine_Digital-Compilation_MP3/031-chase-me-demo.mp3": "chase-me-catch-me-demo",
  "000 Demoesque/Demoesque_Chad-Lewine_Digital-Compilation_MP3/033-one-dance-demo.mp3": "1-dance-demo",
  // 004 HoneyChrome
  "004 HoneyChrome/mp3s for streaming/002-out-with-u.mp3": "outwithu",
  // 005 Daylight Animal
  "005 Daylight Animal/mp3s for streaming/009-daylight-animal-interlude.mp3": "da-interlude",
  // 008 Feeling High
  "008 Feeling High/mp3s for streaming/012-finding-freedom-extended-mix.mp3": "finding-freedom-extended",
  // 011 HYPERISING
  "011 HYPERISING/mp3s for streaming/008-im-staying.mp3": "im-stayin",
};

// Files with no DB row — explicitly skipped (flagged for user decision later).
// Key: path relative to RECORDS_ROOT.
const STREAMING_SKIP: Record<string, string> = {
  "000 Demoesque/Demoesque_Chad-Lewine_Digital-Compilation_MP3/003-stranded.mp3": "No DB song named 'stranded' on Demoesque — skip or add row?",
  "006 All The Right Places/mp3s for streaming/07-you-make-me-wanna-sped-up.mp3": "Sped-up variant of 'You Make Me Wanna' — no separate DB row; skip",
};

// Explicit per-album cover overrides. Post-repack covers live inside each Digital
// subfolder with new "{album}_Chad-Lewine_album-cover-art" naming.
const COVER_OVERRIDES: Record<string, string> = {
  "demoesque": "000 Demoesque/Demoesque_Chad-Lewine_Digital-Compilation_MP3/Demoesque_Chad-Lewine_album-art.jpg",
  "the-human-link": "001 The Human Link/The Human Link - Chad Lewine (Digital Album)/The-Human-Link_Chad-Lewine_album-cover-art.jpg",
  "williamsburgadelphia": "002 Williamsburgadelphia/Williamsburgadelphia - Chad Lewine (Digital EP)/Williamsburgadelphia_Chad-Lewine_album-cover-art.jpg",
  "life-as-a-student": "003 Life as as Student/Life as a Student - Chad Lewine (Digital Album)/Life-as-a-Student_Chad-Lewine_album-cover-art.jpg",
  "honeychrome": "004 HoneyChrome/HoneyChrome - Chad Lewine (Digital Album)/HoneyChrome_Chad-Lewine-album-cover-art.jpg",
  "daylight-animal": "005 Daylight Animal/Daylight Animal - Chad Lewine (Digital Album)/Daylight-Animal_Chad-Lewine-album-cover-art.jpg",
  "all-the-right-places": "006 All The Right Places/All The Right Places - Chad Lewine (Digital EP)/All-The-Right-Places_Chad-Lewine_album-cover-art.jpg",
  "sprout": "007 Sprout/SPROUT - Chad Lewine (Digital Album)/SPROUT_Chad-Lewine_album-cover-art.jpg",
  "feeling-high": "008 Feeling High/Feeling High - Chad Lewine (Digital Album)/Feeling-High_Chad-Lewine_album-cover-art.jpg",
  "the-gap": "009 The Gap/The Gap - Chad Lewine (Digital Compilation)/The-Gap_Chad-Lewine_album-cover-art.jpg",
  "pivotal-days": "010 Pivotal Days/Pivotal Days - Chad Lewine (Digital Compilation)/Pivotal-Days_Chad-Lewine_album-cover-art.jpg",
  "hyperising": "011 HYPERISING/HYPERISING - Chad Lewine (Digital Album)/HYPERISING_Chad-Lewine_album-cover-art.jpg",
};

// DB singles → disk-streaming source (relative to RECORDS_ROOT).
// Post-restructure: streaming source is the MP3-320 at release root.
const SINGLE_STREAMING_SOURCE: Record<string, string> = {
  "35": "009B 35/35_Chad-Lewine_MP3-320.mp3",
  "boomerang": "008B Boomerang/Boomerang_Chad-Lewine_MP3-320.mp3",
  "dark-nights": "009C Dark Nights/Dark-Nights_Chad-Lewine_MP3-320.mp3",
  "riptide-acoustic": "008C Riptide/Riptide-Acoustic_Chad-Lewine.mp3",
  "hope-you-visit-soon-bro": "004A HYVSB/Hope-You-Visit-Soon-Bro_Chad-Lewine.mp3",
  "choose-lit": "011A Choose Lit/Choose-Lit_Chad-Lewine_MP3-320.mp3",
};

// 012 Don't Blame Me — song slug → (stream source, download folder)
// These 3 songs stay on raw per-format audio (user: "fine for now"), no ZIP pack.
const DBM_SONGS: Record<string, { stream: string; downloadFolder: string }> = {
  "dont-blame-me-track": {
    stream: "singles/Dont-Blame-Me/Dont-Blame-Me_Chad-Lewine_MP3-320.mp3",
    downloadFolder: "singles/Dont-Blame-Me",
  },
  "turn-the-mill": {
    stream: "singles/Turn-The-Mill/Turn-The-Mill_Chad-Lewine_MP3-320.mp3",
    downloadFolder: "singles/Turn-The-Mill",
  },
  "johnny-boy": {
    stream: "singles/Johnny-Boy/Johnny-Boy_Chad-Lewine_MP3-320.mp3",
    downloadFolder: "singles/Johnny-Boy",
  },
};

// Albums with MP3-only downloads (no FLAC/WAV ZIPs on disk)
const MP3_ONLY_ALBUMS = new Set(["demoesque", "life-as-a-student"]);

function sizeOf(p: string): number {
  try {
    return statSync(p).size;
  } catch {
    return -1;
  }
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => {
    try {
      return statSync(join(dir, f)).isFile();
    } catch {
      return false;
    }
  });
}

function listDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => {
    try {
      return statSync(join(dir, f)).isDirectory();
    } catch {
      return false;
    }
  });
}

function matchSlug(fileBase: string, songsInAlbum: Song[]): Song | null {
  // Strip leading "NNN-" or "NNN " prefix
  const stripped = fileBase.replace(/^(?:\d+[- ])/, "").toLowerCase();
  // Normalize to slug-like
  const normalized = stripped.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  // 1. exact slug match
  let hit = songsInAlbum.find((s) => s.slug === normalized);
  if (hit) return hit;
  // 2. slug + '-track' suffix
  hit = songsInAlbum.find((s) => s.slug === `${normalized}-track`);
  if (hit) return hit;
  // 3. slug drops '-and-' variants / ampersand handling: "ask-and-tell" → "ask-tell"
  const compact = normalized.replace(/-and-/g, "-");
  hit = songsInAlbum.find((s) => s.slug === compact);
  if (hit) return hit;
  // 4. typo tolerance — "unbelieveable" → "unbelievable"
  const fixed = normalized.replace(/unbelieveable/g, "unbelievable");
  hit = songsInAlbum.find((s) => s.slug === fixed);
  if (hit) return hit;
  return null;
}

// --- Build mapping ---------------------------------------------------------

const albums = AUDIT.albums;
const songs = AUDIT.songs;
const albumSongs = AUDIT.album_songs;
const albumById = new Map(albums.map((a) => [a.id, a]));
const albumBySlug = new Map(albums.map((a) => [a.slug, a]));
const songById = new Map(songs.map((s) => [s.id, s]));
const songBySlug = new Map(songs.map((s) => [s.slug, s]));
const trackNumBySong = new Map<string, number>();
const songsByAlbum = new Map<string, Song[]>();
for (const as of albumSongs) {
  trackNumBySong.set(as.song_id, as.track_number);
  const list = songsByAlbum.get(as.album_id) ?? [];
  const s = songById.get(as.song_id);
  if (s) list.push(s);
  songsByAlbum.set(as.album_id, list);
}
// Sort songs per album by track_number
for (const [, list] of songsByAlbum) {
  list.sort((a, b) => (trackNumBySong.get(a.id) ?? 0) - (trackNumBySong.get(b.id) ?? 0));
}

const mapping: MappingEntry[] = [];
const warnings: string[] = [];
const unmatchedFiles: string[] = [];
const unmatchedSongs: { albumSlug: string; songSlug: string; reason: string }[] = [];

// --- Pass 1: album covers + zips + streaming (albums 000–011) --------------
for (const [folder, albumSlug] of Object.entries(ALBUM_FOLDER_MAP)) {
  const album = albumBySlug.get(albumSlug);
  if (!album) {
    warnings.push(`Folder "${folder}" has no matching album in DB (slug=${albumSlug})`);
    continue;
  }
  const folderAbs = join(RECORDS_ROOT, folder);

  // --- Cover art ---
  const coverOverride = COVER_OVERRIDES[albumSlug];
  if (coverOverride) {
    const src = join(RECORDS_ROOT, coverOverride);
    if (!existsSync(src)) {
      warnings.push(`[cover] ${albumSlug}: override path missing: ${coverOverride}`);
    } else {
      const ext = extname(src).toLowerCase();
      mapping.push({
        source: src,
        sourceBytes: sizeOf(src),
        zone: "cover-art",
        targetPath: `${albumSlug}${ext}`,
        target: { kind: "album", albumId: album.id, albumSlug, column: "cover_art_path" },
      });
    }
  } else {
    const coverCandidates: string[] = [];
    for (const f of listFiles(folderAbs)) {
      if (/\.(jpg|jpeg|png|webp)$/i.test(f) && /album[ _-]art|_art\b/i.test(f)) {
        coverCandidates.push(join(folderAbs, f));
      }
    }
    for (const sub of listDirs(folderAbs)) {
      const subAbs = join(folderAbs, sub);
      for (const f of listFiles(subAbs)) {
        if (/\.(jpg|jpeg|png|webp)$/i.test(f) && /album[ _-]art|_art\b/i.test(f)) {
          coverCandidates.push(join(subAbs, f));
        }
      }
      const artFiles = join(subAbs, "art files");
      if (existsSync(artFiles)) {
        for (const f of listFiles(artFiles)) {
          if (/\.(jpg|jpeg|png|webp)$/i.test(f) && /album[ _-]art/i.test(f)) {
            coverCandidates.push(join(artFiles, f));
          }
        }
      }
    }
    if (coverCandidates.length === 0) {
      warnings.push(`[cover] ${albumSlug}: no album-art file found under ${folder}`);
    } else {
      coverCandidates.sort((a, b) => b.length - a.length);
      const cover = coverCandidates[0];
      const ext = extname(cover).toLowerCase();
      mapping.push({
        source: cover,
        sourceBytes: sizeOf(cover),
        zone: "cover-art",
        targetPath: `${albumSlug}${ext}`,
        target: { kind: "album", albumId: album.id, albumSlug, column: "cover_art_path" },
        note: coverCandidates.length > 1 ? `${coverCandidates.length} candidates; picked longest path` : undefined,
      });
    }
  }

  // --- ZIPs (per format) — sourced from _repack_output/albums/{slug}/ ---
  const zipFormats: ("mp3" | "flac" | "wav")[] = MP3_ONLY_ALBUMS.has(albumSlug)
    ? ["mp3"]
    : ["mp3", "flac", "wav"];
  const repackDir = join(REPACK_OUTPUT, "albums", albumSlug);
  for (const fmt of zipFormats) {
    const matches = listFiles(repackDir).filter((f) => {
      return /\.zip$/i.test(f) && f.toLowerCase().endsWith(`_${fmt}.zip`);
    });
    if (matches.length === 0) {
      warnings.push(`[zip] ${albumSlug}: no ${fmt.toUpperCase()} zip in _repack_output (run phaseM-03 first?)`);
      continue;
    }
    const src = join(repackDir, matches[0]);
    mapping.push({
      source: src,
      sourceBytes: sizeOf(src),
      zone: "music-downloads",
      targetPath: `albums/${albumSlug}/${matches[0]}`,
      target: {
        kind: "album",
        albumId: album.id,
        albumSlug,
        column: `download_path_${fmt}` as "download_path_mp3" | "download_path_flac" | "download_path_wav",
      },
    });
  }

  // --- Streaming MP3s ---
  const streamDir = albumSlug === "demoesque"
    ? join(folderAbs, "Demoesque_Chad-Lewine_Digital-Compilation_MP3")
    : join(folderAbs, "mp3s for streaming");
  const mp3s = listFiles(streamDir).filter((f) => /\.mp3$/i.test(f));
  const matched = new Set<string>();
  const albumSongList = songsByAlbum.get(album.id) ?? [];
  for (const f of mp3s) {
    const streamSubdir = albumSlug === "demoesque" ? "Demoesque_Chad-Lewine_Digital-Compilation_MP3" : "mp3s for streaming";
    const rel = join(folder, streamSubdir, f).replace(/\\/g, "/");
    if (STREAMING_SKIP[rel]) {
      warnings.push(`[skip] ${rel} — ${STREAMING_SKIP[rel]}`);
      continue;
    }
    const override = STREAMING_OVERRIDES[rel];
    const baseName = f.replace(/\.mp3$/i, "");
    let song: Song | null = null;
    if (override) {
      song = songBySlug.get(override) ?? null;
      if (!song) warnings.push(`[override] ${rel} → ${override} (not in DB)`);
    } else {
      song = matchSlug(baseName, albumSongList);
    }
    if (!song) {
      unmatchedFiles.push(rel);
      continue;
    }
    matched.add(song.id);
    const trackNum = trackNumBySong.get(song.id) ?? 0;
    const prefix = String(trackNum).padStart(2, "0");
    mapping.push({
      source: join(streamDir, f),
      sourceBytes: sizeOf(join(streamDir, f)),
      zone: "music-streaming",
      targetPath: `${albumSlug}/${prefix}-${song.slug}.mp3`,
      target: { kind: "song", songId: song.id, songSlug: song.slug, albumSlug, column: "streaming_path" },
    });
  }
  // Report unmatched songs in this album (songs that did not get a streaming file)
  for (const s of albumSongList) {
    if (!matched.has(s.id)) {
      unmatchedSongs.push({ albumSlug, songSlug: s.slug, reason: "no matching streaming mp3 on disk" });
    }
  }
}

// --- Pass 2: Don't Blame Me (012) — 3 released songs -----------------------
for (const [songSlug, info] of Object.entries(DBM_SONGS)) {
  const song = songBySlug.get(songSlug);
  if (!song) {
    warnings.push(`[dbm] ${songSlug} not in DB`);
    continue;
  }
  const trackNum = trackNumBySong.get(song.id) ?? 0;
  const prefix = String(trackNum).padStart(2, "0");
  // streaming
  const streamAbs = join(RECORDS_ROOT, info.stream);
  if (!existsSync(streamAbs)) {
    warnings.push(`[dbm] streaming source missing: ${info.stream}`);
  } else {
    mapping.push({
      source: streamAbs,
      sourceBytes: sizeOf(streamAbs),
      zone: "music-streaming",
      targetPath: `dont-blame-me/${prefix}-${song.slug}.mp3`,
      target: { kind: "song", songId: song.id, songSlug: song.slug, albumSlug: "dont-blame-me", column: "streaming_path" },
    });
  }
  // per-format downloads
  const dlFolderAbs = join(RECORDS_ROOT, info.downloadFolder);
  for (const f of listFiles(dlFolderAbs)) {
    const lower = f.toLowerCase();
    let fmt: "mp3" | "flac" | "wav" | null = null;
    if (lower.endsWith(".flac")) fmt = "flac";
    else if (lower.endsWith(".wav")) fmt = "wav";
    else if (lower.endsWith(".mp3")) fmt = "mp3";
    if (!fmt) continue;
    mapping.push({
      source: join(dlFolderAbs, f),
      sourceBytes: sizeOf(join(dlFolderAbs, f)),
      zone: "music-downloads",
      targetPath: `songs/${song.slug}/${f}`,
      target: { kind: "song", songId: song.id, songSlug: song.slug, albumSlug: "dont-blame-me", column: `download_path_${fmt}` },
    });
  }
}

// --- Pass 3: 6 DB singles --------------------------------------------------
// Singles now ship as ZIPs (from _repack_output/singles/{slug}/), not raw audio.
const DB_SINGLES = songs.filter((s) => s.is_single);
// Map single slug → which formats exist (HYVSB + Riptide are MP3-only)
const MP3_ONLY_SINGLES = new Set(["hope-you-visit-soon-bro", "riptide-acoustic"]);
for (const single of DB_SINGLES) {
  // streaming
  const streamRel = SINGLE_STREAMING_SOURCE[single.slug];
  if (!streamRel) {
    warnings.push(`[single] ${single.slug}: no streaming source mapped`);
  } else {
    const streamAbs = join(RECORDS_ROOT, streamRel);
    if (!existsSync(streamAbs)) {
      warnings.push(`[single] ${single.slug}: streaming source missing at ${streamRel}`);
    } else {
      mapping.push({
        source: streamAbs,
        sourceBytes: sizeOf(streamAbs),
        zone: "music-streaming",
        targetPath: `singles/${single.slug}.mp3`,
        target: { kind: "song", songId: single.id, songSlug: single.slug, albumSlug: null, column: "streaming_path" },
      });
    }
  }
  // per-format downloads — point at repacked ZIPs
  const singleRepackDir = join(REPACK_OUTPUT, "singles", single.slug);
  const formats: ("mp3" | "flac" | "wav")[] = MP3_ONLY_SINGLES.has(single.slug) ? ["mp3"] : ["mp3", "flac", "wav"];
  for (const fmt of formats) {
    const matches = listFiles(singleRepackDir).filter((f) => /\.zip$/i.test(f) && f.toLowerCase().endsWith(`_${fmt}.zip`));
    if (matches.length === 0) {
      warnings.push(`[single] ${single.slug}: no ${fmt.toUpperCase()} zip in _repack_output (run phaseM-03 first?)`);
      continue;
    }
    const src = join(singleRepackDir, matches[0]);
    mapping.push({
      source: src,
      sourceBytes: sizeOf(src),
      zone: "music-downloads",
      targetPath: `singles/${single.slug}/${matches[0]}`,
      target: { kind: "song", songId: single.id, songSlug: single.slug, albumSlug: null, column: `download_path_${fmt}` },
    });
  }
}

// --- Report ----------------------------------------------------------------

function fmtSize(n: number): string {
  if (n < 0) return "?";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

const byZone = mapping.reduce<Record<string, { count: number; bytes: number }>>((acc, m) => {
  acc[m.zone] ??= { count: 0, bytes: 0 };
  acc[m.zone].count++;
  acc[m.zone].bytes += Math.max(0, m.sourceBytes);
  return acc;
}, {});

console.log(`\n=== MAPPING SUMMARY ===`);
console.log(`  Total entries: ${mapping.length}`);
for (const [zone, s] of Object.entries(byZone)) {
  console.log(`    ${zone.padEnd(18)} ${s.count.toString().padStart(4)} files, ${fmtSize(s.bytes)}`);
}
console.log(`  Warnings: ${warnings.length}`);
console.log(`  Unmatched files: ${unmatchedFiles.length}`);
console.log(`  Songs without streaming: ${unmatchedSongs.length}`);

if (warnings.length) {
  console.log(`\n=== WARNINGS ===`);
  for (const w of warnings) console.log(`  ${w}`);
}
if (unmatchedFiles.length) {
  console.log(`\n=== UNMATCHED FILES (no DB row) ===`);
  for (const f of unmatchedFiles) console.log(`  ${f}`);
}
if (unmatchedSongs.length) {
  console.log(`\n=== DB SONGS WITHOUT STREAMING FILE ===`);
  for (const u of unmatchedSongs) console.log(`  ${u.albumSlug}: ${u.songSlug} — ${u.reason}`);
}

console.log(`\n=== PER-ALBUM BREAKDOWN ===`);
for (const [folder, slug] of Object.entries(ALBUM_FOLDER_MAP)) {
  const entries = mapping.filter((m) =>
    (m.target.kind === "album" && m.target.albumSlug === slug) ||
    (m.target.kind === "song" && m.target.albumSlug === slug)
  );
  const cover = entries.filter((m) => m.zone === "cover-art").length;
  const zips = entries.filter((m) => m.zone === "music-downloads").length;
  const streams = entries.filter((m) => m.zone === "music-streaming").length;
  console.log(`  ${slug.padEnd(22)} cover=${cover} zips=${zips} streams=${streams}`);
}
console.log(`  (dbm 3 released songs)  streams=${mapping.filter((m) => m.target.kind === "song" && m.target.albumSlug === "dont-blame-me" && m.zone === "music-streaming").length} dl-files=${mapping.filter((m) => m.target.kind === "song" && m.target.albumSlug === "dont-blame-me" && m.zone === "music-downloads").length}`);
console.log(`  singles (6)             streams=${mapping.filter((m) => m.target.kind === "song" && m.target.albumSlug === null && m.zone === "music-streaming").length} dl-files=${mapping.filter((m) => m.target.kind === "song" && m.target.albumSlug === null && m.zone === "music-downloads").length}`);

writeFileSync(
  "scripts/phaseM-02-mapping.out.json",
  JSON.stringify({ mapping, warnings, unmatchedFiles, unmatchedSongs }, null, 2)
);
console.log(`\nWrote scripts/phaseM-02-mapping.out.json (${mapping.length} entries)`);
