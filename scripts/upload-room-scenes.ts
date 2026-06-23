/**
 * Upload the View-In-A-Room backplates to the chadlewine-site-images Bunny zone
 * under room-scenes/, and print the public URL + slug for each so they can be wired
 * into the room_scenes table.
 *
 * Source: C:/Users/chad/Dropbox/Debug/room-scenes/view-in-a-room-*.png
 * Run: cd "C:/Users/chad/Local Sites/chadlewine" && npx tsx scripts/upload-room-scenes.ts
 */

import { config as loadEnv } from "dotenv";
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { join } from "node:path";

loadEnv({ path: ".env.local" });

const STORAGE_HOSTNAME = process.env.BUNNY_STORAGE_HOSTNAME!;
const ZONE = process.env.BUNNY_STORAGE_ZONE_SITE_IMAGES!;
const PASSWORD = process.env.BUNNY_STORAGE_ZONE_SITE_IMAGES_PASSWORD!;
const PULL_ZONE = process.env.NEXT_PUBLIC_BUNNY_PULL_ZONE_SITE_IMAGES!;

if (!STORAGE_HOSTNAME || !ZONE || !PASSWORD || !PULL_ZONE) {
  console.error("Missing Bunny site-images env vars.");
  process.exit(1);
}

const SRC_DIR = "C:/Users/chad/Dropbox/Debug/room-scenes";
const DEST_PREFIX = "room-scenes";

async function upload(path: string, buf: Buffer) {
  const url = `https://${STORAGE_HOSTNAME}/${ZONE}/${path}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { AccessKey: PASSWORD, "Content-Type": "image/png" },
    body: buf,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`upload ${path}: ${res.status} ${res.statusText} - ${text.slice(0, 200)}`);
  }
}

async function main() {
  const files = readdirSync(SRC_DIR).filter((f) => /^view-in-a-room-.*\.png$/i.test(f));
  console.log(`Uploading ${files.length} backplates to ${PULL_ZONE}/${DEST_PREFIX}/\n`);

  for (const file of files) {
    const buf = await readFile(join(SRC_DIR, file));
    const dest = `${DEST_PREFIX}/${file}`;
    await upload(dest, buf);
    const slug = file.replace(/^view-in-a-room-/, "").replace(/\.png$/i, "");
    const publicUrl = `https://${PULL_ZONE}/${dest}`;
    console.log(`  ${slug.padEnd(22)} ${publicUrl}`);
  }
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
