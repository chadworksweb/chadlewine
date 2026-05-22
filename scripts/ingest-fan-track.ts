// Ingest a wav/aiff master into the fan-tracks HLS+AES pipeline.
//
//   npx tsx scripts/ingest-fan-track.ts <input-path> <slug> "<title>" [--artist "Chad Lewine"]
//   npx tsx scripts/ingest-fan-track.ts "C:/path/Aint About Me.wav" for-my-fans-01 "Aint About Me"
//
// Steps:
//   1. Probe input for duration (so the fan_tracks row carries duration_seconds).
//   2. Generate a 16-byte AES key. Write to a local keyfile.
//   3. Run ffmpeg with -hls_key_info_file pointing at the keyfile. The URI in
//      keyinfo.txt is a placeholder; the manifest API route rewrites it to
//      /api/for-my-fans/[slug]/key before serving.
//   4. Upload segment*.ts + playlist.m3u8 to the Bunny fan-tracks storage
//      zone under "<slug>/".
//   5. Insert a fan_tracks row with the base64-encoded key. is_published
//      stays FALSE -- toggle it on from /admin/fan-tracks/<slug>.
//
// Requires: ffmpeg + ffprobe on PATH, .env.local with BUNNY_STORAGE_ZONE_FAN_TRACKS*,
// SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL.

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createClient } from "@supabase/supabase-js";

// ---- Env bootstrap -----------------------------------------------------

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8")
    .split("\n")
    .forEach((line) => {
      const [k, ...rest] = line.split("=");
      if (k && rest.length) process.env[k.trim()] = rest.join("=").trim();
    });
}

function envRequired(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
  return v;
}

// ---- Args ---------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error(
      'Usage: npx tsx scripts/ingest-fan-track.ts <input> <slug> "<title>" [--artist "..."]',
    );
    process.exit(1);
  }
  const input = args[0];
  const slug = args[1];
  const title = args[2];
  let artist = "Chad Lewine";
  for (let i = 3; i < args.length - 1; i++) {
    if (args[i] === "--artist") artist = args[i + 1];
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    console.error(`Slug must be url-safe lowercase: ${slug}`);
    process.exit(1);
  }
  if (!fs.existsSync(input)) {
    console.error(`Input not found: ${input}`);
    process.exit(1);
  }
  return { input, slug, title, artist };
}

// ---- ffprobe duration ---------------------------------------------------

function probeDurationSeconds(input: string): number | null {
  const res = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      input,
    ],
    { encoding: "utf-8" },
  );
  if (res.status !== 0) {
    console.warn("[ingest] ffprobe failed; duration will be null");
    return null;
  }
  const seconds = parseFloat((res.stdout || "").trim());
  return Number.isFinite(seconds) ? Math.round(seconds) : null;
}

// ---- HLS encode ---------------------------------------------------------

function encodeHls(opts: { input: string; outDir: string; keyfile: string; keyinfo: string }) {
  // -hls_time 6: 6-second segments. -hls_list_size 0: write all entries.
  // -hls_segment_filename: segment000.ts, segment001.ts, ...
  const args = [
    "-y",
    "-i",
    opts.input,
    "-vn", // strip any video stream
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-hls_time",
    "6",
    "-hls_list_size",
    "0",
    "-hls_segment_filename",
    path.join(opts.outDir, "segment%03d.ts"),
    "-hls_key_info_file",
    opts.keyinfo,
    "-f",
    "hls",
    path.join(opts.outDir, "playlist.m3u8"),
  ];
  console.log(`[ingest] ffmpeg ${args.join(" ")}`);
  const res = spawnSync("ffmpeg", args, { stdio: "inherit" });
  if (res.status !== 0) {
    console.error("[ingest] ffmpeg failed");
    process.exit(1);
  }
}

// ---- Bunny upload -------------------------------------------------------

async function uploadToBunny(opts: {
  storageZone: string;
  storagePassword: string;
  storageHost: string;
  remotePath: string;
  localFile: string;
  contentType: string;
}): Promise<void> {
  const url = `https://${opts.storageHost}/${opts.storageZone}/${opts.remotePath}`;
  const buf = fs.readFileSync(opts.localFile);
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      AccessKey: opts.storagePassword,
      "Content-Type": opts.contentType,
    },
    body: buf,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bunny PUT ${remotePathShort(opts.remotePath)} failed: ${res.status} ${text}`);
  }
}

function remotePathShort(p: string): string {
  return p.length > 64 ? "..." + p.slice(-60) : p;
}

// ---- Main ---------------------------------------------------------------

(async () => {
  const { input, slug, title, artist } = parseArgs();

  const SUPABASE_URL = envRequired("NEXT_PUBLIC_SUPABASE_URL");
  const SUPABASE_KEY = envRequired("SUPABASE_SERVICE_ROLE_KEY");
  const STORAGE_HOST = process.env.BUNNY_STORAGE_HOSTNAME || "ny.storage.bunnycdn.com";
  const STORAGE_ZONE = envRequired("BUNNY_STORAGE_ZONE_FAN_TRACKS");
  const STORAGE_PASSWORD = envRequired("BUNNY_STORAGE_ZONE_FAN_TRACKS_PASSWORD");

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  // 1. Probe duration.
  const duration = probeDurationSeconds(input);
  console.log(`[ingest] duration ~${duration ?? "unknown"}s`);

  // 2. Generate AES key + keyinfo.txt in a temp dir.
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), `fan-track-${slug}-`));
  const outDir = path.join(tmpRoot, "hls");
  fs.mkdirSync(outDir);

  const keyBytes = randomBytes(16);
  const keyfile = path.join(tmpRoot, "key.bin");
  fs.writeFileSync(keyfile, keyBytes);

  const keyinfo = path.join(tmpRoot, "keyinfo.txt");
  // URI in the playlist is rewritten by the manifest API route, so a
  // placeholder value is fine here -- it never reaches the client.
  fs.writeFileSync(keyinfo, `PLACEHOLDER_KEY_URI\n${keyfile}\n`);

  // 3. Encode.
  encodeHls({ input, outDir, keyfile, keyinfo });

  // 4. Upload. Walk outDir for playlist.m3u8 + segment*.ts.
  const files = fs.readdirSync(outDir).filter((f) => /\.(m3u8|ts)$/.test(f));
  if (!files.includes("playlist.m3u8")) {
    console.error("[ingest] playlist.m3u8 not found in outDir");
    process.exit(1);
  }
  console.log(`[ingest] uploading ${files.length} files to bunny://${STORAGE_ZONE}/${slug}/`);
  for (const f of files) {
    const local = path.join(outDir, f);
    const remote = `${slug}/${f}`;
    const ct = f.endsWith(".m3u8")
      ? "application/vnd.apple.mpegurl"
      : "video/mp2t";
    await uploadToBunny({
      storageZone: STORAGE_ZONE,
      storagePassword: STORAGE_PASSWORD,
      storageHost: STORAGE_HOST,
      remotePath: remote,
      localFile: local,
      contentType: ct,
    });
    process.stdout.write(".");
  }
  process.stdout.write("\n");

  // 5. Insert fan_tracks row.
  const keyB64 = keyBytes.toString("base64");
  const { data: row, error } = await supabase
    .from("fan_tracks")
    .insert({
      slug,
      title,
      artist_credit: artist,
      duration_seconds: duration,
      hls_playlist_path: `${slug}/playlist.m3u8`,
      hls_key_b64: keyB64,
      is_published: false,
    })
    .select("id, slug")
    .single();

  if (error) {
    console.error("[ingest] DB insert failed:", error.message);
    console.error(
      "  Bunny upload already happened. Either delete the bunny dir + retry, or insert manually.",
    );
    process.exit(1);
  }

  // 6. Clean up temp.
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // non-fatal -- tmp dir is OS-managed.
  }

  console.log(`[ingest] OK -- fan_tracks.id = ${row.id}, slug = ${row.slug}`);
  console.log(`[ingest] Next: open /admin/fan-tracks/${slug} and click "Publish + backfill grants".`);
})();
