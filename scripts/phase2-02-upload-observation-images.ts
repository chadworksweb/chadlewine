/**
 * Phase 2 — Step 2: Copy observation-images backup → chadlewine-site-images Bunny zone.
 *
 * Walks the local Dropbox backup at C:/Users/chad/Dropbox/Debug/chadlewine-media-backup/observation-images/
 * and uploads every file to Bunny Storage preserving the relative path exactly,
 * so filenames keyed in media_meta continue to match.
 *
 * Skips files that already exist at the destination (HEAD check) to allow re-runs.
 *
 * Run: cd "C:/Users/chad/Local Sites/chadlewine" && npx tsx scripts/phase2-02-upload-observation-images.ts
 */

import { config as loadEnv } from "dotenv";
import { readFile } from "node:fs/promises";
import { readdirSync, statSync } from "node:fs";
import { join, posix, relative, sep } from "node:path";

loadEnv({ path: ".env.local" });

const STORAGE_HOSTNAME = process.env.BUNNY_STORAGE_HOSTNAME!;
const ZONE = process.env.BUNNY_STORAGE_ZONE_SITE_IMAGES!;
const PASSWORD = process.env.BUNNY_STORAGE_ZONE_SITE_IMAGES_PASSWORD!;
const PULL_ZONE = process.env.NEXT_PUBLIC_BUNNY_PULL_ZONE_SITE_IMAGES!;

if (!STORAGE_HOSTNAME || !ZONE || !PASSWORD || !PULL_ZONE) {
  console.error("Missing Bunny site-images env vars.");
  process.exit(1);
}

const SRC_ROOT = "C:/Users/chad/Dropbox/Debug/chadlewine-media-backup/observation-images";

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function contentTypeFor(filename: string): string {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  switch (ext) {
    case "webp": return "image/webp";
    case "jpg":
    case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "gif": return "image/gif";
    default: return "application/octet-stream";
  }
}

async function exists(path: string): Promise<boolean> {
  const url = `https://${STORAGE_HOSTNAME}/${ZONE}/${path}`;
  const res = await fetch(url, { method: "GET", headers: { AccessKey: PASSWORD } });
  // Bunny returns 200 if file present, 404 if not
  return res.status === 200;
}

async function upload(path: string, buf: Buffer, contentType: string) {
  const url = `https://${STORAGE_HOSTNAME}/${ZONE}/${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { AccessKey: PASSWORD, "Content-Type": contentType },
    body: buf,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`upload ${path}: ${res.status} ${res.statusText} — ${text.slice(0, 200)}`);
  }
}

async function main() {
  const files = walk(SRC_ROOT);
  console.log(`Source: ${SRC_ROOT}`);
  console.log(`Dest:   ${PULL_ZONE} (zone ${ZONE})`);
  console.log(`Files:  ${files.length}\n`);

  let uploaded = 0, skipped = 0;
  for (const full of files) {
    const rel = relative(SRC_ROOT, full).split(sep).join(posix.sep);
    if (await exists(rel)) {
      console.log(`  skip  ${rel}`);
      skipped++;
      continue;
    }
    const buf = await readFile(full);
    await upload(rel, buf, contentTypeFor(rel));
    console.log(`  up    ${rel} (${buf.length} bytes)`);
    uploaded++;
  }

  console.log(`\nDone. uploaded=${uploaded}, skipped=${skipped}, total=${files.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
