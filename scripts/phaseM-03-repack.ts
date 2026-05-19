/**
 * Repack all album + single ZIPs with new cover art embedded + loose.
 *
 * Strategy per release:
 *   - MP3/FLAC source: existing ZIP (re-mux audio with -c copy, swap embedded cover)
 *   - WAV source: Digital subfolder WAVs (straight copy, loose cover only; embedded
 *     ID3v2 in WAV is not widely supported)
 *   - Loose files added to ZIP: new album cover + bonus art/*  (+ album-specific extras)
 *   - ZIP internal layout mirrors existing: {Album folder name}/{files}
 *
 * Singles:
 *   - Audio source: release-level folder raw files (*.wav, *.flac, _MP3-320.mp3)
 *   - Cover: *_single-cover-art.{jpg,png} at folder root
 *   - ZIP internal layout: {Title-With-Hyphens}/{audio} + {cover}
 *
 * Usage:
 *   npx tsx scripts/phaseM-03-repack.ts --list          # print plan, no action
 *   npx tsx scripts/phaseM-03-repack.ts --only SLUG     # one release only
 *   npx tsx scripts/phaseM-03-repack.ts                 # full repack
 *
 * Temp dir: D:/RECORDS/_repack_staging/
 * Output:   D:/RECORDS/_repack_output/{album|singles}/{slug}/{filename}.zip
 *           (staged in _repack_output so nothing clobbers existing ZIPs until user approves swap)
 */
import { spawn } from "child_process";
import { copyFileSync, createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "fs";
import { basename, extname, join } from "path";
import archiver from "archiver";
import yauzl from "yauzl";

const RECORDS_ROOT = "D:/RECORDS";
const STAGING = "D:/RECORDS/_repack_staging";
const OUTPUT = "D:/RECORDS/_repack_output";

type Format = "mp3" | "flac" | "wav";

type AlbumDef = {
  slug: string;
  folder: string;             // relative to RECORDS_ROOT, e.g. "001 The Human Link"
  digitalFolder: string;      // relative to folder, e.g. "The Human Link - Chad Lewine (Digital Album)"
  zipPrefix: string;          // e.g. "The-Human-Link_Chad-Lewine_Digital-Album"
  albumFolderInZip: string;   // internal ZIP root folder, e.g. "The Human Link - Chad Lewine (Digital Album)"
  coverFile: string;          // absolute path to new cover (used for embed + loose file)
  bonusFolder: string | null; // absolute path to bonus-art folder, or null
  extraLooseFiles: string[];  // absolute paths to extra loose files to include (e.g. message_from_chad.mp4)
  formats: Format[];
};

type SingleDef = {
  slug: string;                // DB song slug
  folder: string;              // relative to RECORDS_ROOT, e.g. "009B 35"
  zipBase: string;             // e.g. "35_Chad-Lewine_Single"
  zipInternalFolder: string;   // e.g. "35 - Chad Lewine (Single)"
  coverFile: string;           // absolute path
  formats: Format[];
};

const ALBUMS: AlbumDef[] = [
  {
    slug: "demoesque",
    folder: "000 Demoesque",
    digitalFolder: "Demoesque_Chad-Lewine_Digital-Compilation_MP3",
    zipPrefix: "Demoesque_Chad-Lewine_Digital-Compilation",
    albumFolderInZip: "Demoesque - Chad Lewine (Digital Compilation)",
    coverFile: join(RECORDS_ROOT, "000 Demoesque/Demoesque_Chad-Lewine_Digital-Compilation_MP3/Demoesque_Chad-Lewine_album-art.jpg"),
    bonusFolder: null,
    extraLooseFiles: [],
    formats: ["mp3"],
  },
  {
    slug: "the-human-link",
    folder: "001 The Human Link",
    digitalFolder: "The Human Link - Chad Lewine (Digital Album)",
    zipPrefix: "The-Human-Link_Chad-Lewine_Digital-Album",
    albumFolderInZip: "The Human Link - Chad Lewine (Digital Album)",
    coverFile: join(RECORDS_ROOT, "001 The Human Link/The Human Link - Chad Lewine (Digital Album)/The-Human-Link_Chad-Lewine_album-cover-art.jpg"),
    bonusFolder: join(RECORDS_ROOT, "001 The Human Link/The Human Link - Chad Lewine (Digital Album)/bonus art"),
    extraLooseFiles: [],
    formats: ["mp3", "flac", "wav"],
  },
  {
    slug: "williamsburgadelphia",
    folder: "002 Williamsburgadelphia",
    digitalFolder: "Williamsburgadelphia - Chad Lewine (Digital EP)",
    zipPrefix: "Williamsburgadelphia_Chad-Lewine_Digital-EP",
    albumFolderInZip: "Williamsburgadelphia - Chad Lewine (Digital EP)",
    coverFile: join(RECORDS_ROOT, "002 Williamsburgadelphia/Williamsburgadelphia - Chad Lewine (Digital EP)/Williamsburgadelphia_Chad-Lewine_album-cover-art.jpg"),
    bonusFolder: join(RECORDS_ROOT, "002 Williamsburgadelphia/Williamsburgadelphia - Chad Lewine (Digital EP)/bonus art"),
    extraLooseFiles: [],
    formats: ["mp3", "flac", "wav"],
  },
  {
    slug: "life-as-a-student",
    folder: "003 Life as as Student",
    digitalFolder: "Life as a Student - Chad Lewine (Digital Album)",
    zipPrefix: "Life-as-a-Student_Chad-Lewine_Digital-Album",
    albumFolderInZip: "Life as a Student - Chad Lewine (Digital Album)",
    coverFile: join(RECORDS_ROOT, "003 Life as as Student/Life as a Student - Chad Lewine (Digital Album)/Life-as-a-Student_Chad-Lewine_album-cover-art.jpg"),
    bonusFolder: join(RECORDS_ROOT, "003 Life as as Student/Life as a Student - Chad Lewine (Digital Album)/bonus art"),
    extraLooseFiles: [],
    formats: ["mp3"], // MP3-only album; no WAVs on disk, no FLAC ZIP
  },
  {
    slug: "honeychrome",
    folder: "004 HoneyChrome",
    digitalFolder: "HoneyChrome - Chad Lewine (Digital Album)",
    zipPrefix: "HoneyChrome_Chad-Lewine_Digital-Album",
    albumFolderInZip: "HoneyChrome - Chad Lewine (Digital Album)",
    coverFile: join(RECORDS_ROOT, "004 HoneyChrome/HoneyChrome - Chad Lewine (Digital Album)/HoneyChrome_Chad-Lewine-album-cover-art.jpg"),
    bonusFolder: join(RECORDS_ROOT, "004 HoneyChrome/HoneyChrome - Chad Lewine (Digital Album)/bonus art"),
    extraLooseFiles: [],
    formats: ["mp3", "flac", "wav"],
  },
  {
    slug: "daylight-animal",
    folder: "005 Daylight Animal",
    digitalFolder: "Daylight Animal - Chad Lewine (Digital Album)",
    zipPrefix: "Daylight-Animal_Chad-Lewine_Digital-Album",
    albumFolderInZip: "Daylight Animal - Chad Lewine (Digital Album)",
    coverFile: join(RECORDS_ROOT, "005 Daylight Animal/Daylight Animal - Chad Lewine (Digital Album)/Daylight-Animal_Chad-Lewine-album-cover-art.jpg"),
    bonusFolder: join(RECORDS_ROOT, "005 Daylight Animal/Daylight Animal - Chad Lewine (Digital Album)/bonus-art"),
    extraLooseFiles: [],
    formats: ["mp3", "flac", "wav"],
  },
  {
    slug: "all-the-right-places",
    folder: "006 All The Right Places",
    digitalFolder: "All The Right Places - Chad Lewine (Digital EP)",
    zipPrefix: "All-The-Right-Places_Chad-Lewine_Digital-EP",
    albumFolderInZip: "All The Right Places - Chad Lewine (Digital EP)",
    coverFile: join(RECORDS_ROOT, "006 All The Right Places/All The Right Places - Chad Lewine (Digital EP)/All-The-Right-Places_Chad-Lewine_album-cover-art.jpg"),
    bonusFolder: join(RECORDS_ROOT, "006 All The Right Places/All The Right Places - Chad Lewine (Digital EP)/bonus art"),
    extraLooseFiles: [],
    formats: ["mp3", "flac", "wav"],
  },
  {
    slug: "sprout",
    folder: "007 Sprout",
    digitalFolder: "SPROUT - Chad Lewine (Digital Album)",
    zipPrefix: "SPROUT_Chad-Lewine_Digital-Album",
    albumFolderInZip: "SPROUT - Chad Lewine (Digital Album)",
    coverFile: join(RECORDS_ROOT, "007 Sprout/SPROUT - Chad Lewine (Digital Album)/SPROUT_Chad-Lewine_album-cover-art.jpg"),
    bonusFolder: join(RECORDS_ROOT, "007 Sprout/SPROUT - Chad Lewine (Digital Album)/bonus art"),
    extraLooseFiles: [],
    formats: ["mp3", "flac", "wav"],
  },
  {
    slug: "feeling-high",
    folder: "008 Feeling High",
    digitalFolder: "Feeling High - Chad Lewine (Digital Album)",
    zipPrefix: "Feeling-High_Chad-Lewine_Digital-Album",
    albumFolderInZip: "Feeling High - Chad Lewine (Digital Album)",
    coverFile: join(RECORDS_ROOT, "008 Feeling High/Feeling High - Chad Lewine (Digital Album)/Feeling-High_Chad-Lewine_album-cover-art.jpg"),
    bonusFolder: join(RECORDS_ROOT, "008 Feeling High/Feeling High - Chad Lewine (Digital Album)/bonus art"),
    extraLooseFiles: [],
    formats: ["mp3", "flac", "wav"],
  },
  {
    slug: "the-gap",
    folder: "009 The Gap",
    digitalFolder: "The Gap - Chad Lewine (Digital Compilation)",
    zipPrefix: "The-Gap_Chad-Lewine_Digital-Compilation",
    albumFolderInZip: "The Gap - Chad Lewine (Digital Compilation)",
    coverFile: join(RECORDS_ROOT, "009 The Gap/The Gap - Chad Lewine (Digital Compilation)/The-Gap_Chad-Lewine_album-cover-art.jpg"),
    bonusFolder: join(RECORDS_ROOT, "009 The Gap/The Gap - Chad Lewine (Digital Compilation)/bonus art"),
    extraLooseFiles: [],
    formats: ["mp3", "flac", "wav"],
  },
  {
    slug: "pivotal-days",
    folder: "010 Pivotal Days",
    digitalFolder: "Pivotal Days - Chad Lewine (Digital Compilation)",
    zipPrefix: "Pivotal-Days_Chad-Lewine_Digital-Compilation",
    albumFolderInZip: "Pivotal Days - Chad Lewine (Digital Compilation)",
    coverFile: join(RECORDS_ROOT, "010 Pivotal Days/Pivotal Days - Chad Lewine (Digital Compilation)/Pivotal-Days_Chad-Lewine_album-cover-art.jpg"),
    bonusFolder: join(RECORDS_ROOT, "010 Pivotal Days/Pivotal Days - Chad Lewine (Digital Compilation)/bonus art"),
    extraLooseFiles: [],
    formats: ["mp3", "flac", "wav"],
  },
  {
    slug: "hyperising",
    folder: "011 HYPERISING",
    digitalFolder: "HYPERISING - Chad Lewine (Digital Album)",
    zipPrefix: "HYPERISING_Chad-Lewine_Digital-Album",
    albumFolderInZip: "HYPERISING - Chad Lewine (Digital Album)",
    coverFile: join(RECORDS_ROOT, "011 HYPERISING/HYPERISING - Chad Lewine (Digital Album)/HYPERISING_Chad-Lewine_album-cover-art.jpg"),
    bonusFolder: null, // no bonus art folder for HYPERISING
    extraLooseFiles: [
      join(RECORDS_ROOT, "011 HYPERISING/HYPERISING - Chad Lewine (Digital Album)/message_from_chad.mp4"),
    ],
    formats: ["mp3", "flac", "wav"],
  },
];

const SINGLES: SingleDef[] = [
  {
    slug: "35",
    folder: "009B 35",
    zipBase: "35_Chad-Lewine_Single",
    zipInternalFolder: "35 - Chad Lewine (Single)",
    coverFile: join(RECORDS_ROOT, "009B 35/35_Chad-Lewine-single-cover-art.jpg"),
    formats: ["mp3", "flac", "wav"],
  },
  {
    slug: "boomerang",
    folder: "008B Boomerang",
    zipBase: "Boomerang_Chad-Lewine_Single",
    zipInternalFolder: "Boomerang - Chad Lewine (Single)",
    coverFile: join(RECORDS_ROOT, "008B Boomerang/Boomerang_Chad-Lewine_single-cover-art.jpg"),
    formats: ["mp3", "flac", "wav"],
  },
  {
    slug: "choose-lit",
    folder: "011A Choose Lit",
    zipBase: "Choose-Lit_Chad-Lewine_Single",
    zipInternalFolder: "Choose Lit - Chad Lewine (Single)",
    coverFile: join(RECORDS_ROOT, "011A Choose Lit/Choose-Lit_Chad-Lewine_single-cover-art.jpg"),
    formats: ["mp3", "flac", "wav"],
  },
  {
    slug: "dark-nights",
    folder: "009C Dark Nights",
    zipBase: "Dark-Nights_Chad-Lewine_Single",
    zipInternalFolder: "Dark Nights - Chad Lewine (Single)",
    coverFile: join(RECORDS_ROOT, "009C Dark Nights/Dark-Nights_Chad-Lewine_single-cover-art.jpg"),
    formats: ["mp3", "flac", "wav"],
  },
  {
    slug: "hope-you-visit-soon-bro",
    folder: "004A HYVSB",
    zipBase: "Hope-You-Visit-Soon-Bro_Chad-Lewine_Single",
    zipInternalFolder: "Hope You Visit Soon, Bro - Chad Lewine (Single)",
    coverFile: join(RECORDS_ROOT, "004A HYVSB/Hope-You-Visit-Soon-Bro_Chad-Lewine_single-cover-art.jpg"),
    formats: ["mp3"],
  },
  {
    slug: "riptide-acoustic",
    folder: "008C Riptide",
    zipBase: "Riptide-Acoustic_Chad-Lewine_Single",
    zipInternalFolder: "Riptide (Acoustic) - Chad Lewine (Single)",
    coverFile: join(RECORDS_ROOT, "008C Riptide/Riptide_Chad-Lewine-single-cover-art.png"),
    formats: ["mp3"],
  },
];

// --- util helpers ---------------------------------------------------------

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function rmDirIfExists(p: string) {
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
}

function listFilesOf(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => {
    try { return statSync(join(dir, f)).isFile(); } catch { return false; }
  });
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exit ${code}: ${stderr.slice(-400)}`));
    });
  });
}

async function unzipTo(zipPath: string, destDir: string): Promise<void> {
  ensureDir(destDir);
  return new Promise((resolve, reject) => {
    yauzl.open(zipPath, { lazyEntries: true }, (err, zip) => {
      if (err) return reject(err);
      if (!zip) return reject(new Error("no zip"));
      zip.readEntry();
      zip.on("entry", (entry) => {
        const outPath = join(destDir, entry.fileName);
        if (entry.fileName.endsWith("/")) {
          ensureDir(outPath);
          zip.readEntry();
          return;
        }
        ensureDir(join(outPath, ".."));
        zip.openReadStream(entry, (e2, stream) => {
          if (e2 || !stream) return reject(e2 ?? new Error("no stream"));
          const out = createWriteStream(outPath);
          stream.pipe(out);
          out.on("close", () => zip.readEntry());
          out.on("error", reject);
        });
      });
      zip.on("end", resolve);
      zip.on("error", reject);
    });
  });
}

async function zipFolder(folderAbs: string, zipOut: string, internalRoot: string): Promise<void> {
  ensureDir(join(zipOut, ".."));
  return new Promise((resolve, reject) => {
    const output = createWriteStream(zipOut);
    const archive = archiver("zip", { zlib: { level: 6 } });
    output.on("close", () => resolve());
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(folderAbs, internalRoot);
    archive.finalize();
  });
}

/**
 * Re-mux audio with new embedded cover (MP3/FLAC). Preserves existing metadata,
 * replaces embedded cover. Uses -c copy (no audio re-encode).
 */
async function embedCover(inPath: string, coverPath: string, outPath: string, fmt: Format): Promise<void> {
  ensureDir(join(outPath, ".."));
  const common = [
    "-y",
    "-hide_banner",
    "-loglevel", "error",
    "-i", inPath,
    "-i", coverPath,
    "-map", "0:a",
    "-map", "1:v",
    "-c", "copy",
    "-disposition:v:0", "attached_pic",
  ];
  if (fmt === "mp3") {
    await run("ffmpeg", [...common, "-id3v2_version", "3", outPath]);
  } else if (fmt === "flac") {
    await run("ffmpeg", [...common, outPath]);
  } else {
    // WAV — ID3v2 support in WAV is patchy; skip embed, just copy. Loose cover
    // in the ZIP is the de-facto standard for WAV releases anyway.
    copyFileSync(inPath, outPath);
  }
}

// --- album repack --------------------------------------------------------

async function repackAlbumFormat(album: AlbumDef, fmt: Format): Promise<string> {
  const stagingBase = join(STAGING, album.slug, fmt);
  rmDirIfExists(stagingBase);
  ensureDir(stagingBase);
  const internal = join(stagingBase, album.albumFolderInZip);
  ensureDir(internal);

  // --- source audio ---
  if (fmt === "wav") {
    // WAVs from Digital subfolder
    const digitalAbs = join(RECORDS_ROOT, album.folder, album.digitalFolder);
    for (const f of listFilesOf(digitalAbs)) {
      if (!/\.wav$/i.test(f)) continue;
      copyFileSync(join(digitalAbs, f), join(internal, f));
    }
  } else if (album.slug === "demoesque") {
    // 000: MP3 source is the extracted folder (not a zip)
    const srcDir = join(RECORDS_ROOT, album.folder, album.digitalFolder);
    for (const f of listFilesOf(srcDir)) {
      if (!/\.mp3$/i.test(f)) continue;
      const src = join(srcDir, f);
      const dst = join(internal, f);
      await embedCover(src, album.coverFile, dst, "mp3");
    }
  } else if (album.slug === "life-as-a-student" && fmt === "mp3") {
    // 003: MP3 source is the Digital subfolder MP3s (no WAVs, no FLAC ZIP)
    const srcDir = join(RECORDS_ROOT, album.folder, album.digitalFolder);
    for (const f of listFilesOf(srcDir)) {
      if (!/\.mp3$/i.test(f)) continue;
      const src = join(srcDir, f);
      // Name inside ZIP: keep file as-is (matches consumer naming already)
      // But existing ZIP used "01 Regatta.mp3" style. Keep existing scheme from
      // extracting the current MP3 ZIP instead, to preserve titles.
      const dst = join(internal, f);
      await embedCover(src, album.coverFile, dst, "mp3");
    }
  } else {
    // MP3/FLAC source: extract existing ZIP, re-mux each audio file with new cover
    const existingZip = join(RECORDS_ROOT, album.folder, `${album.zipPrefix}_${fmt.toUpperCase()}.zip`);
    if (!existsSync(existingZip)) throw new Error(`missing source ZIP: ${existingZip}`);
    const extractTo = join(STAGING, album.slug, `_extract_${fmt}`);
    rmDirIfExists(extractTo);
    await unzipTo(existingZip, extractTo);
    const srcRoot = join(extractTo, album.albumFolderInZip);
    // audio files
    for (const f of listFilesOf(srcRoot)) {
      const ext = extname(f).toLowerCase().slice(1);
      if (ext !== fmt) continue;
      const src = join(srcRoot, f);
      const dst = join(internal, f);
      await embedCover(src, album.coverFile, dst, fmt);
    }
    // For MP3 packs, also merge in any MP3s sitting loose in the Digital
    // subfolder — lets us add MP3-only tracks (e.g. Gap's radiate-piano-demo)
    // to an album that otherwise ships full-format (WAV/FLAC/MP3).
    if (fmt === "mp3") {
      const digitalAbs = join(RECORDS_ROOT, album.folder, album.digitalFolder);
      for (const f of listFilesOf(digitalAbs)) {
        if (!/\.mp3$/i.test(f)) continue;
        const dst = join(internal, f);
        if (existsSync(dst)) continue; // existing ZIP wins
        await embedCover(join(digitalAbs, f), album.coverFile, dst, "mp3");
      }
    }
  }

  // --- loose files: new album cover at internal root ---
  copyFileSync(album.coverFile, join(internal, basename(album.coverFile)));

  // --- bonus art folder ---
  if (album.bonusFolder && existsSync(album.bonusFolder)) {
    const destBonus = join(internal, "bonus art");
    ensureDir(destBonus);
    for (const f of listFilesOf(album.bonusFolder)) {
      copyFileSync(join(album.bonusFolder, f), join(destBonus, f));
    }
  }

  // --- extra loose files ---
  for (const extra of album.extraLooseFiles) {
    if (!existsSync(extra)) continue;
    copyFileSync(extra, join(internal, basename(extra)));
  }

  // --- pack ---
  const outZip = join(OUTPUT, "albums", album.slug, `${album.zipPrefix}_${fmt.toUpperCase()}.zip`);
  rmDirIfExists(outZip);
  await zipFolder(internal, outZip, album.albumFolderInZip);
  return outZip;
}

async function repackSingleFormat(single: SingleDef, fmt: Format): Promise<string> {
  const stagingBase = join(STAGING, `single-${single.slug}`, fmt);
  rmDirIfExists(stagingBase);
  ensureDir(stagingBase);
  const internal = join(stagingBase, single.zipInternalFolder);
  ensureDir(internal);

  const folderAbs = join(RECORDS_ROOT, single.folder);
  const files = listFilesOf(folderAbs);

  // pick audio source for this format
  const audioSrc = files.find((f) => {
    const lower = f.toLowerCase();
    if (fmt === "mp3") return lower.endsWith("_mp3-320.mp3") || lower.endsWith(".mp3");
    if (fmt === "flac") return lower.endsWith(".flac");
    if (fmt === "wav") return lower.endsWith(".wav");
    return false;
  });
  if (!audioSrc) throw new Error(`single ${single.slug}: no ${fmt} audio in ${folderAbs}`);

  // Rename the audio file in pack for tidy consumer look — drop "_MP3-320" suffix, standardize
  const baseName = audioSrc
    .replace(/_MP3-320\.mp3$/i, ".mp3");
  const dst = join(internal, baseName);
  await embedCover(join(folderAbs, audioSrc), single.coverFile, dst, fmt);

  // loose cover
  copyFileSync(single.coverFile, join(internal, basename(single.coverFile)));

  const outZip = join(OUTPUT, "singles", single.slug, `${single.zipBase}_${fmt.toUpperCase()}.zip`);
  rmDirIfExists(outZip);
  await zipFolder(internal, outZip, single.zipInternalFolder);
  return outZip;
}

// --- CLI ------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const listOnly = args.includes("--list");
  const onlyIdx = args.indexOf("--only");
  const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

  const targets: Array<{ kind: "album" | "single"; def: AlbumDef | SingleDef }> = [
    ...ALBUMS.map((a) => ({ kind: "album" as const, def: a })),
    ...SINGLES.map((s) => ({ kind: "single" as const, def: s })),
  ];

  const selected = only ? targets.filter((t) => t.def.slug === only) : targets;
  if (only && selected.length === 0) {
    console.error(`No release matches --only ${only}`);
    process.exit(1);
  }

  console.log(`\n=== REPACK PLAN ===`);
  for (const t of selected) {
    console.log(`  ${t.kind.padEnd(6)} ${t.def.slug.padEnd(25)} formats=[${t.def.formats.join(",")}]  cover=${basename(t.def.coverFile)}`);
  }
  if (listOnly) {
    console.log("\n(--list mode; no action)");
    return;
  }

  ensureDir(STAGING);
  ensureDir(OUTPUT);

  const results: { release: string; format: Format; zip: string; bytes: number }[] = [];
  for (const t of selected) {
    for (const fmt of t.def.formats) {
      const label = `${t.kind}:${t.def.slug}:${fmt}`;
      const started = Date.now();
      console.log(`\n>> ${label}`);
      try {
        const zip = t.kind === "album"
          ? await repackAlbumFormat(t.def as AlbumDef, fmt)
          : await repackSingleFormat(t.def as SingleDef, fmt);
        const bytes = statSync(zip).size;
        results.push({ release: t.def.slug, format: fmt, zip, bytes });
        console.log(`   done in ${((Date.now() - started) / 1000).toFixed(1)}s  ${zip}  (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
      } catch (e) {
        console.error(`   FAILED: ${(e as Error).message}`);
      }
    }
  }

  console.log(`\n=== SUMMARY ===`);
  const totalBytes = results.reduce((n, r) => n + r.bytes, 0);
  console.log(`  ${results.length} zips, ${(totalBytes / 1024 / 1024 / 1024).toFixed(2)} GB`);
  for (const r of results) console.log(`  ${r.format.toUpperCase().padEnd(5)} ${r.release.padEnd(25)} ${(r.bytes / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
