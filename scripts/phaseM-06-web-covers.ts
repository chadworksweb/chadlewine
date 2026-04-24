/**
 * Generate 2000px wide / 50%-lossy WebP versions of every album + single cover
 * and upload to chadlewine-site-images/cover-art-web/{slug}.webp
 */
import { spawn } from "child_process";
import { createReadStream, existsSync, mkdirSync, statSync } from "fs";
import { join } from "path";
import { Readable } from "stream";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const RECORDS_ROOT = "D:/RECORDS";
const OUT_DIR = "D:/RECORDS/_repack_output/covers-web";
const STORAGE_HOSTNAME = process.env.BUNNY_STORAGE_HOSTNAME ?? "ny.storage.bunnycdn.com";
const ZONE = requireEnv("BUNNY_STORAGE_ZONE_SITE_IMAGES");
const PASS = requireEnv("BUNNY_STORAGE_ZONE_SITE_IMAGES_PASSWORD");
const PULL = requireEnv("NEXT_PUBLIC_BUNNY_PULL_ZONE_SITE_IMAGES");

function requireEnv(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}

// slug → absolute source path
const COVERS: Record<string, string> = {
  "demoesque": join(RECORDS_ROOT, "000 Demoesque/Demoesque_Chad-Lewine_Digital-Compilation_MP3/Demoesque_Chad-Lewine_album-art.jpg"),
  "the-human-link": join(RECORDS_ROOT, "001 The Human Link/The Human Link - Chad Lewine (Digital Album)/The-Human-Link_Chad-Lewine_album-cover-art.jpg"),
  "williamsburgadelphia": join(RECORDS_ROOT, "002 Williamsburgadelphia/Williamsburgadelphia - Chad Lewine (Digital EP)/Williamsburgadelphia_Chad-Lewine_album-cover-art.jpg"),
  "life-as-a-student": join(RECORDS_ROOT, "003 Life as as Student/Life as a Student - Chad Lewine (Digital Album)/Life-as-a-Student_Chad-Lewine_album-cover-art.jpg"),
  "honeychrome": join(RECORDS_ROOT, "004 HoneyChrome/HoneyChrome - Chad Lewine (Digital Album)/HoneyChrome_Chad-Lewine-album-cover-art.jpg"),
  "daylight-animal": join(RECORDS_ROOT, "005 Daylight Animal/Daylight Animal - Chad Lewine (Digital Album)/Daylight-Animal_Chad-Lewine-album-cover-art.jpg"),
  "all-the-right-places": join(RECORDS_ROOT, "006 All The Right Places/All The Right Places - Chad Lewine (Digital EP)/All-The-Right-Places_Chad-Lewine_album-cover-art.jpg"),
  "sprout": join(RECORDS_ROOT, "007 Sprout/SPROUT - Chad Lewine (Digital Album)/SPROUT_Chad-Lewine_album-cover-art.jpg"),
  "feeling-high": join(RECORDS_ROOT, "008 Feeling High/Feeling High - Chad Lewine (Digital Album)/Feeling-High_Chad-Lewine_album-cover-art.jpg"),
  "the-gap": join(RECORDS_ROOT, "009 The Gap/The Gap - Chad Lewine (Digital Compilation)/The-Gap_Chad-Lewine_album-cover-art.jpg"),
  "pivotal-days": join(RECORDS_ROOT, "010 Pivotal Days/Pivotal Days - Chad Lewine (Digital Compilation)/Pivotal-Days_Chad-Lewine_album-cover-art.jpg"),
  "hyperising": join(RECORDS_ROOT, "011 HYPERISING/HYPERISING - Chad Lewine (Digital Album)/HYPERISING_Chad-Lewine_album-cover-art.jpg"),
  "35": join(RECORDS_ROOT, "009B 35/35_Chad-Lewine-single-cover-art.jpg"),
  "boomerang": join(RECORDS_ROOT, "008B Boomerang/Boomerang_Chad-Lewine_single-cover-art.jpg"),
  "choose-lit": join(RECORDS_ROOT, "011A Choose Lit/Choose-Lit_Chad-Lewine_single-cover-art.jpg"),
  "dark-nights": join(RECORDS_ROOT, "009C Dark Nights/Dark-Nights_Chad-Lewine_single-cover-art.jpg"),
  "hope-you-visit-soon-bro": join(RECORDS_ROOT, "004A HYVSB/Hope-You-Visit-Soon-Bro_Chad-Lewine_single-cover-art.jpg"),
  "riptide-acoustic": join(RECORDS_ROOT, "008C Riptide/Riptide_Chad-Lewine-single-cover-art.png"),
};

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (c) => (c === 0 ? resolve() : reject(new Error(`${cmd} ${c}: ${err.slice(-300)}`))));
  });
}

async function upload(path: string, src: string): Promise<void> {
  const url = `https://${STORAGE_HOSTNAME}/${ZONE}/${path.replace(/^\/+/, "")}`;
  const size = statSync(src).size;
  const body = Readable.toWeb(createReadStream(src)) as unknown as ReadableStream;
  const res = await fetch(url, {
    method: "PUT",
    headers: { AccessKey: PASS, "Content-Type": "image/webp", "Content-Length": String(size) },
    // @ts-expect-error duplex required for streamed body
    duplex: "half",
    body,
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${(await res.text()).slice(0, 200)}`);
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const results: { slug: string; src: number; out: number; url: string }[] = [];
  for (const [slug, src] of Object.entries(COVERS)) {
    const started = Date.now();
    if (!existsSync(src)) {
      console.error(`  MISSING source: ${slug} ← ${src}`);
      continue;
    }
    const outFile = join(OUT_DIR, `${slug}.webp`);
    await run("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-i", src,
      "-vf", "scale=2000:-1",
      "-c:v", "libwebp",
      "-quality", "50",
      outFile,
    ]);
    const outSize = statSync(outFile).size;
    const srcSize = statSync(src).size;

    const bunnyPath = `cover-art-web/${slug}.webp`;
    await upload(bunnyPath, outFile);
    const url = `${PULL.replace(/\/+$/, "")}/${bunnyPath}`;
    results.push({ slug, src: srcSize, out: outSize, url });
    console.log(`  ${slug.padEnd(25)} ${(srcSize / 1024 / 1024).toFixed(1).padStart(5)}MB → ${(outSize / 1024).toFixed(0).padStart(5)}KB  ${((Date.now() - started) / 1000).toFixed(1)}s  ${url}`);
  }
  console.log(`\n${results.length} web covers generated + uploaded`);
  const totalIn = results.reduce((n, r) => n + r.src, 0);
  const totalOut = results.reduce((n, r) => n + r.out, 0);
  console.log(`  Source:  ${(totalIn / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  WebP:    ${(totalOut / 1024 / 1024).toFixed(1)} MB  (${((totalOut / totalIn) * 100).toFixed(1)}% of source)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
