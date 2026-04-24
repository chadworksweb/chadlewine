/**
 * Phase 2 — Step 1: Non-destructive backup of Supabase Storage buckets to Dropbox.
 *
 * Downloads every file from `observation-images` and `art-fullres` to
 * C:/Users/chad/Dropbox/Debug/chadlewine-media-backup/<bucket>/<path>
 * preserving subfolder structure. Safety net before Bunny backfill.
 *
 * Run: cd "C:/Users/chad/Local Sites/chadlewine" && npx tsx scripts/phase2-01-backup-supabase-buckets.ts
 */

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

loadEnv({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const BACKUP_ROOT = "C:/Users/chad/Dropbox/Debug/chadlewine-media-backup";
const BUCKETS = ["observation-images", "art-fullres"];

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

type Entry = { path: string; size: number };

async function listAll(bucket: string, prefix = ""): Promise<Entry[]> {
  const out: Entry[] = [];
  let offset = 0;
  const limit = 1000;
  while (true) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const item of data) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      // Subfolders show up as items with no id / metadata
      if (item.id === null || item.metadata === null) {
        const nested = await listAll(bucket, full);
        out.push(...nested);
      } else {
        out.push({ path: full, size: item.metadata?.size ?? 0 });
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return out;
}

async function downloadOne(bucket: string, path: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw new Error(`download ${bucket}/${path}: ${error?.message ?? "no data"}`);
  const buf = Buffer.from(await data.arrayBuffer());
  return buf;
}

async function backupBucket(bucket: string) {
  console.log(`\n=== ${bucket} ===`);
  const entries = await listAll(bucket);
  console.log(`  ${entries.length} file(s), ${(entries.reduce((a, e) => a + e.size, 0) / 1024 / 1024).toFixed(2)} MB`);

  let done = 0;
  for (const { path } of entries) {
    const dest = join(BACKUP_ROOT, bucket, path);
    await mkdir(dirname(dest), { recursive: true });
    const buf = await downloadOne(bucket, path);
    await writeFile(dest, buf);
    done++;
    if (done % 10 === 0 || done === entries.length) {
      console.log(`  ${done}/${entries.length}`);
    }
  }
  console.log(`  → ${join(BACKUP_ROOT, bucket)}`);
}

async function main() {
  console.log(`Backup root: ${BACKUP_ROOT}`);
  await mkdir(BACKUP_ROOT, { recursive: true });
  for (const bucket of BUCKETS) {
    await backupBucket(bucket);
  }
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
