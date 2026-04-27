/**
 * Phase 2 — Step 3: Copy art_pieces images from chadrising-art → chadlewine-site-images/art-thumbnails/
 *
 * For each art_pieces row with a chadrising-art.b-cdn.net image_path:
 *   1. Download from the public CDN URL
 *   2. Save a local backup to C:/Users/chad/Dropbox/Debug/chadlewine-media-backup/art-thumbnails/
 *   3. Upload to chadlewine-site-images/art-thumbnails/{filename}
 * Subfolders (paintings/apparel/digital-art/murals) flatten into art-thumbnails/ — audit confirmed no filename collisions.
 *
 * Idempotent: HEAD check on destination skips already-uploaded files.
 * DB URL rewrite happens in phase2-04.
 */

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

loadEnv({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const STORAGE_HOSTNAME = process.env.BUNNY_STORAGE_HOSTNAME!;
const ZONE = process.env.BUNNY_STORAGE_ZONE_SITE_IMAGES!;
const PASSWORD = process.env.BUNNY_STORAGE_ZONE_SITE_IMAGES_PASSWORD!;
const PULL_ZONE = process.env.NEXT_PUBLIC_BUNNY_PULL_ZONE_SITE_IMAGES!;

const SOURCE_HOST = "chadrising-art.b-cdn.net";
const DEST_FOLDER = "art-thumbnails";
const BACKUP_ROOT = `C:/Users/chad/Dropbox/Debug/chadlewine-media-backup/${DEST_FOLDER}`;

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

async function destExists(path: string): Promise<boolean> {
  const url = `https://${STORAGE_HOSTNAME}/${ZONE}/${path}`;
  const res = await fetch(url, { method: "GET", headers: { AccessKey: PASSWORD } });
  return res.status === 200;
}

async function uploadToBunny(path: string, buf: Buffer, contentType: string) {
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
  const { data, error } = await supabase
    .from("art_pieces")
    .select("id, image_path")
    .not("image_path", "is", null);
  if (error) throw error;

  const rows = (data ?? []).filter(
    (r) => typeof r.image_path === "string" && r.image_path.includes(SOURCE_HOST)
  );
  console.log(`${rows.length} art_pieces to copy\n`);

  let uploaded = 0, skipped = 0, backedUp = 0;
  const missing: Array<{ id: unknown; url: string }> = [];

  for (const row of rows) {
    const src = new URL(row.image_path as string);
    const filename = src.pathname.split("/").filter(Boolean).pop()!;
    const destPath = `${DEST_FOLDER}/${filename}`;

    if (await destExists(destPath)) {
      console.log(`  skip  ${destPath}`);
      skipped++;
      continue;
    }

    const srcRes = await fetch(row.image_path as string);
    if (srcRes.status === 404) {
      console.log(`  MISS  ${row.image_path} (id=${row.id})`);
      missing.push({ id: row.id, url: row.image_path as string });
      continue;
    }
    if (!srcRes.ok) {
      throw new Error(`fetch source ${row.image_path}: ${srcRes.status} ${srcRes.statusText}`);
    }
    const buf = Buffer.from(await srcRes.arrayBuffer());

    const backupPath = `${BACKUP_ROOT}/${filename}`;
    await mkdir(dirname(backupPath), { recursive: true });
    await writeFile(backupPath, buf);
    backedUp++;

    await uploadToBunny(destPath, buf, contentTypeFor(filename));
    console.log(`  up    ${destPath} (${buf.length} bytes)`);
    uploaded++;
  }

  console.log(`\nDone. uploaded=${uploaded}, skipped=${skipped}, backed_up=${backedUp}, missing=${missing.length}`);
  if (missing.length) {
    console.log("\nBROKEN art_pieces rows (source file 404 on chadrising-art):");
    for (const m of missing) console.log(`  id=${m.id}  ${m.url}`);
  }
  console.log(`Pull zone: ${PULL_ZONE}/${DEST_FOLDER}/`);
  console.log(`Backup:    ${BACKUP_ROOT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
