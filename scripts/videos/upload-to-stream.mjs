// Upload local video files to Bunny Stream and create their `videos` rows.
//
// Bunny transcodes on ingest and builds the whole HLS ladder itself, so this
// uploads ONE mezzanine per video and lets Bunny do the rest. The library
// (569029) tops out at 1080p -- anything taller is downscaled server-side, so
// feeding it a 4K source only costs upload time. Downscale to 1080 first.
//
// Usage (from repo root):
//   node --env-file=.env.local scripts/videos/upload-to-stream.mjs <manifest.json>
//   node --env-file=.env.local scripts/videos/upload-to-stream.mjs <manifest.json> --apply
//
// Without --apply this is a DRY RUN: it validates the manifest, probes every
// file, resolves categories and songs, and prints the plan without touching
// Bunny or the database.
//
// Extra env this needs beyond .env.local:
//   BUNNY_STREAM_API_KEY   -- Bunny dashboard > Stream > library 569029 > API
//
// Manifest shape (array):
//   {
//     "file": "D:/CL Videos/one takes/with music/finding-freedom.mp4",
//     "title": "Finding Freedom - One Take",
//     "slug": "finding-freedom-one-take",         // optional, derived from title
//     "category": "live-performances",            // video_categories.slug
//     "song": "finding-freedom",                  // optional, songs.slug
//     "description": "...",                       // optional
//     "status": "draft",                          // draft | published
//     "featured": false,                          // optional
//     "publishedAt": "2026-08-18T12:00:00Z",      // optional
//     "poster": { "at": "00:00:12", "cropY": 40 } // optional frame grab
//   }

import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { readFile, stat, unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID || "569029";
const STREAM_API = "https://video.bunnycdn.com";
const APPLY = process.argv.includes("--apply");
const manifestPath = process.argv[2];

if (!manifestPath || manifestPath.startsWith("--")) {
  console.error("Usage: node --env-file=.env.local scripts/videos/upload-to-stream.mjs <manifest.json> [--apply]");
  process.exit(1);
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
  return v;
}

const supabase = createClient(
  requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
);

// Mirrors src/lib/utils slugify closely enough for titles we control.
const APOSTROPHES = /['\u2018\u2019]/g;
const slugify = (s) =>
  s
    .toLowerCase()
    .replace(APOSTROPHES, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-400)}`)),
    );
  });
}

async function probe(file) {
  const out = await run("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,codec_name,r_frame_rate",
    "-show_entries", "format=duration",
    "-of", "json",
    file,
  ]);
  const j = JSON.parse(out);
  const v = (j.streams && j.streams[0]) || {};
  return {
    width: v.width ?? null,
    height: v.height ?? null,
    codec: v.codec_name ?? null,
    fps: v.r_frame_rate ?? null,
    duration: j.format?.duration ? Math.round(Number(j.format.duration)) : null,
  };
}

// Grab one frame and crop it into the 16:9 tablet slot the Pantheon collection
// renders. cropY picks which horizontal band of a vertical source survives the
// crop (0 = top, 100 = bottom, default centre). A 16:9 source is untouched by
// the crop and only gets scaled.
async function makePoster(file, meta, poster) {
  const at = poster?.at || (meta.duration ? String(Math.max(1, Math.floor(meta.duration * 0.1))) : "5");
  const cropY = typeof poster?.cropY === "number" ? poster.cropY : 50;
  const out = join(tmpdir(), `cl-poster-${randomUUID()}.webp`);
  const yExpr = `(ih-oh)*${(cropY / 100).toFixed(4)}`;
  await run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-ss", at, "-i", file, "-frames:v", "1",
    "-vf", `crop=iw:min(ih\\,iw*9/16):0:${yExpr},scale=1280:720:flags=lanczos`,
    "-c:v", "libwebp", "-quality", "82",
    out,
  ]);
  return out;
}

async function bunnyStream(path, init = {}) {
  const res = await fetch(`${STREAM_API}/library/${LIBRARY_ID}${path}`, {
    ...init,
    headers: { AccessKey: requireEnv("BUNNY_STREAM_API_KEY"), ...(init.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bunny Stream ${init.method || "GET"} ${path} -> ${res.status} ${text.slice(0, 200)}`);
  }
  return res.status === 204 ? null : res.json();
}

async function uploadThumb(guid, localPath) {
  const zone = requireEnv("BUNNY_STORAGE_ZONE_SITE_IMAGES");
  const key = requireEnv("BUNNY_STORAGE_ZONE_SITE_IMAGES_PASSWORD");
  const host = process.env.BUNNY_STORAGE_HOSTNAME || "ny.storage.bunnycdn.com";
  const pull = requireEnv("NEXT_PUBLIC_BUNNY_PULL_ZONE_SITE_IMAGES").replace(/\/+$/, "");
  const remote = `video-thumbs/${guid}.webp`;
  const body = await readFile(localPath);
  const res = await fetch(`https://${host}/${zone}/${remote}`, {
    method: "PUT",
    headers: { AccessKey: key, "Content-Type": "image/webp" },
    body,
  });
  if (!res.ok) throw new Error(`Thumb upload -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  return `${pull}/${remote}`;
}

// Bunny status codes: 0 created, 1 uploaded, 2 processing, 3 TRANSCODING,
// 4 finished, 5 error, 6 upload-failed. Only 4 means the ladder is built --
// treating 3 as done would write the row (and cut the poster) while renditions
// were still encoding, leaving a published video that plays nothing.
const DONE = new Set([4]);
const FAILED = new Set([5, 6]);

async function waitForEncode(guid) {
  const started = Date.now();
  for (;;) {
    const v = await bunnyStream(`/videos/${guid}`);
    if (DONE.has(v.status)) return v;
    if (FAILED.has(v.status)) throw new Error(`Bunny encode failed for ${guid}`);
    if (Date.now() - started > 60 * 60 * 1000) throw new Error(`Encode timed out for ${guid}`);
    process.stdout.write(`    encoding... status=${v.status} ${v.encodeProgress ?? 0}%\r`);
    await new Promise((r) => setTimeout(r, 15000));
  }
}

// ---------------------------------------------------------------- validation

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (!Array.isArray(manifest) || manifest.length === 0) {
  console.error("Manifest must be a non-empty array.");
  process.exit(1);
}

const { data: categories, error: ce } = await supabase.from("video_categories").select("id,slug,title");
if (ce) { console.error(ce.message); process.exit(1); }
const catBySlug = new Map(categories.map((c) => [c.slug, c]));

const { data: songs, error: se } = await supabase.from("songs").select("id,slug,status");
if (se) { console.error(se.message); process.exit(1); }
const songBySlug = new Map(songs.map((s) => [s.slug, s]));

const { data: existing, error: ve } = await supabase.from("videos").select("slug,stream_id");
if (ve) { console.error(ve.message); process.exit(1); }
const takenSlugs = new Set(existing.map((v) => v.slug));

const problems = [];
const planned = [];

for (const entry of manifest) {
  const label = entry.title || entry.file || "(unnamed)";
  if (!entry.file) { problems.push(`${label}: no "file"`); continue; }
  if (!entry.title) { problems.push(`${label}: no "title"`); continue; }

  try { await stat(entry.file); }
  catch { problems.push(`${label}: file not found -- ${entry.file}`); continue; }

  const slug = entry.slug || slugify(entry.title);
  if (takenSlugs.has(slug)) { problems.push(`${label}: slug "${slug}" already exists in videos`); continue; }

  let category = null;
  if (entry.category) {
    category = catBySlug.get(entry.category);
    if (!category) { problems.push(`${label}: unknown category "${entry.category}"`); continue; }
  }

  let song = null;
  if (entry.song) {
    song = songBySlug.get(entry.song);
    if (!song) { problems.push(`${label}: unknown song "${entry.song}"`); continue; }
  }

  const meta = await probe(entry.file);
  const size = (await stat(entry.file)).size;
  // The library ladder stops at 1080p. A source whose SHORT side is over 1080
  // is pure upload cost -- Bunny throws the extra pixels away server-side.
  const shortSide = Math.min(meta.width || 0, meta.height || 0);
  if (shortSide > 1080) {
    problems.push(`${label}: ${meta.width}x${meta.height} exceeds the 1080p library ladder -- downscale first`);
    continue;
  }

  planned.push({ entry, slug, category, song, meta, size });
  takenSlugs.add(slug);
}

console.log(`\n${planned.length} ready, ${problems.length} blocked, ${APPLY ? "APPLY" : "DRY RUN"}\n`);
for (const p of planned) {
  const mb = (p.size / 1048576).toFixed(0);
  console.log(
    `  OK  ${p.slug}\n` +
    `      ${p.meta.width}x${p.meta.height} ${p.meta.codec} ${p.meta.fps} ${p.meta.duration}s ${mb}MB\n` +
    `      category=${p.category?.slug ?? "(none)"} song=${p.song?.slug ?? "(none)"} status=${p.entry.status || "draft"}`,
  );
}
for (const p of problems) console.log(`  BLOCKED  ${p}`);

if (problems.length > 0) {
  console.log("\nFix the blocked entries before applying -- nothing was uploaded.");
  process.exit(1);
}
if (!APPLY) {
  console.log("\nDry run only. Re-run with --apply to upload and write rows.");
  process.exit(0);
}

// -------------------------------------------------------------------- apply

for (const p of planned) {
  const { entry, slug, category, song, meta, size } = p;
  console.log(`\n${slug}`);

  const created = await bunnyStream("/videos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: entry.title }),
  });
  const guid = created.guid;
  console.log(`    created ${guid}`);

  const res = await fetch(`${STREAM_API}/library/${LIBRARY_ID}/videos/${guid}`, {
    method: "PUT",
    headers: {
      AccessKey: requireEnv("BUNNY_STREAM_API_KEY"),
      "Content-Type": "application/octet-stream",
      "Content-Length": String(size),
    },
    body: Readable.toWeb(createReadStream(entry.file)),
    duplex: "half",
  });
  if (!res.ok) throw new Error(`Upload ${slug} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  console.log(`    uploaded ${(size / 1048576).toFixed(0)}MB`);

  await waitForEncode(guid);
  console.log(`    encoded                                        `);

  const posterFile = await makePoster(entry.file, meta, entry.poster);
  const thumbnailPath = await uploadThumb(guid, posterFile);
  await unlink(posterFile).catch(() => {});
  console.log(`    thumbnail ${thumbnailPath}`);

  const status = entry.status === "published" ? "published" : "draft";
  const { error } = await supabase.from("videos").insert({
    title: entry.title,
    slug,
    category_id: category?.id ?? null,
    stream_id: guid,
    embed_url: null,
    thumbnail_path: thumbnailPath,
    description: entry.description || null,
    duration_seconds: meta.duration,
    song_id: song?.id ?? null,
    is_featured: Boolean(entry.featured),
    status,
    published_at: entry.publishedAt || (status === "published" ? new Date().toISOString() : null),
  });
  if (error) throw new Error(`Insert ${slug} -> ${error.message}`);
  console.log(`    row written (${status})`);
}

console.log(`\nDone. ${planned.length} video(s) live on Bunny and in the videos table.`);
