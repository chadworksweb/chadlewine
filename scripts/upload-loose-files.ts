/**
 * One-off loose-file uploader for songs whose audio doesn't live in any
 * standard album zip pack. Pass <song-slug> + <source-path> + <format>
 * triplets; uploads to Bunny music-downloads zone and writes the matching
 * download_path_<format> column.
 *
 * Usage:
 *   npx tsx scripts/upload-loose-files.ts --dry-run
 *   npx tsx scripts/upload-loose-files.ts
 */
import { createReadStream, statSync } from "fs";
import { basename } from "path";
import { Readable } from "stream";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BUNNY = {
  host: process.env.BUNNY_STORAGE_HOSTNAME ?? "ny.storage.bunnycdn.com",
  zone: process.env.BUNNY_STORAGE_ZONE_MUSIC_DOWNLOADS!,
  password: process.env.BUNNY_STORAGE_ZONE_MUSIC_DOWNLOADS_PASSWORD!,
};

type Format = "mp3" | "flac" | "wav";
type Job = { slug: string; format: Format; source: string };

// Edit this list as needed. Source paths can be Windows or POSIX style.
const JOBS: Job[] = [
  {
    slug: "radiate-piano-demo",
    format: "mp3",
    source: "D:\\RECORDS\\009 The Gap\\The Gap - Chad Lewine (Digital Compilation)\\008-radiate-piano-demo.mp3",
  },
  {
    slug: "you-make-me-wanna-sped-up",
    format: "mp3",
    source: "D:\\RECORDS\\006 All The Right Places\\mp3s for streaming\\07-you-make-me-wanna-sped-up.mp3",
  },
  {
    slug: "you-make-me-wanna-sped-up",
    format: "wav",
    source: "D:\\RECORDS\\006 All The Right Places\\masters\\07 you make me wanna (sped up).wav",
  },
];

function sanitizeBasename(name: string): string {
  return name.replace(/[/\\]/g, "-").replace(/\s+/g, "-");
}

function mimeOf(f: Format): string {
  if (f === "mp3") return "audio/mpeg";
  if (f === "flac") return "audio/flac";
  return "audio/wav";
}

function fmtSize(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

async function bunnyPut(path: string, src: string, format: Format): Promise<void> {
  const stat = statSync(src);
  const stream = Readable.toWeb(createReadStream(src)) as unknown as ReadableStream;
  const url = `https://${BUNNY.host}/${BUNNY.zone}/${path}`;
  const res = await fetch(url, {
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
    const t = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} - ${t.slice(0, 200)}`);
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  let uploaded = 0;
  let failed = 0;
  for (const job of JOBS) {
    const filename = sanitizeBasename(basename(job.source));
    const targetPath = `songs/${job.slug}/${filename}`;
    const stat = statSync(job.source);
    const col = `download_path_${job.format}`;
    console.log(
      `\n[${job.format}] ${job.slug}\n  src: ${job.source}\n  ->  ${targetPath}  (${fmtSize(stat.size)})`,
    );
    if (dryRun) continue;
    try {
      const t = Date.now();
      await bunnyPut(targetPath, job.source, job.format);
      console.log(`  UP in ${((Date.now() - t) / 1000).toFixed(1)}s`);
      const { error } = await supabase
        .from("songs")
        .update({ [col]: targetPath })
        .eq("slug", job.slug);
      if (error) throw error;
      console.log(`  DB updated (${col})`);
      uploaded++;
    } catch (err) {
      failed++;
      console.log(`  FAIL: ${(err as Error).message}`);
    }
  }
  console.log(`\nuploaded: ${uploaded}  failed: ${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
