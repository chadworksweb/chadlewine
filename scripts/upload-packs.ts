/**
 * Upload a release's staged download packs to Bunny and wire them to its
 * digital SKU.
 *
 * Third step of the release-packing chain:
 *   pack-release.ts   -> builds the zips into _repack_output/albums/<slug>/
 *   stream-release.ts -> builds and publishes the streaming MP3s
 *   upload-packs.ts   -> this: uploads the zips, sets the SKU download paths
 *
 * The music-downloads zone is token-auth, so the database stores the RAW
 * relative path (albums/<slug>/<file>.zip), not a full URL. The download token
 * route signs it per request.
 *
 * Usage:
 *   npx tsx scripts/upload-packs.ts --slug dont-blame-me --dry-run
 *   npx tsx scripts/upload-packs.ts --slug dont-blame-me
 *   npx tsx scripts/upload-packs.ts --slug dont-blame-me --skip-db
 *
 * Re-running is safe: an existing remote file is skipped unless --force.
 */
import { createReadStream, existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { Readable } from "stream";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local", quiet: true });

const RECORDS_ROOT = process.env.RECORDS_ROOT || "D:/RECORDS";
const STORAGE_HOSTNAME = process.env.BUNNY_STORAGE_HOSTNAME || "ny.storage.bunnycdn.com";

const FORMAT_COLUMN: Record<string, string> = {
  MP3: "download_path_mp3",
  FLAC: "download_path_flac",
  WAV: "download_path_wav",
  AAC: "download_path_aac",
};

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function requireEnv(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}

function mb(n: number): string {
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Which format a staged zip is, read off its _FORMAT.zip suffix.
function formatOf(filename: string): string | null {
  const m = /_([A-Z0-9]+)\.zip$/i.exec(filename);
  if (!m) return null;
  const f = m[1].toUpperCase();
  return f in FORMAT_COLUMN ? f : null;
}

// Bunny storage answers 401 to HEAD even with a valid AccessKey, so the
// already-uploaded check reads the directory listing instead of probing files.
async function remoteSizes(
  zone: string,
  password: string,
  dir: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const res = await fetch(`https://${STORAGE_HOSTNAME}/${zone}/${dir}/`, {
    headers: { AccessKey: password },
  });
  if (!res.ok) return out;
  const rows = (await res.json()) as Array<{ ObjectName: string; Length: number }>;
  for (const r of rows) out.set(r.ObjectName, r.Length);
  return out;
}

async function upload(zone: string, password: string, path: string, src: string): Promise<number> {
  const size = statSync(src).size;
  const body = Readable.toWeb(createReadStream(src)) as unknown as ReadableStream;
  const res = await fetch(`https://${STORAGE_HOSTNAME}/${zone}/${path}`, {
    method: "PUT",
    headers: {
      AccessKey: password,
      "Content-Type": "application/zip",
      "Content-Length": String(size),
    },
    // @ts-expect-error duplex is required for a streamed body
    duplex: "half",
    body,
  });
  if (!res.ok) throw new Error(`upload ${path}: ${res.status} ${res.statusText}`);
  return size;
}

async function main() {
  const slug = arg("slug");
  if (!slug) {
    console.error(
      "Usage: npx tsx scripts/upload-packs.ts --slug <release-slug> [--force] [--skip-db] [--dry-run]",
    );
    process.exit(1);
  }
  const dryRun = flag("dry-run");
  const force = flag("force");
  const skipDb = flag("skip-db");

  const stagedDir = join(RECORDS_ROOT, "_repack_output", "albums", slug);
  if (!existsSync(stagedDir)) throw new Error(`Nothing staged at ${stagedDir}`);

  const zips = readdirSync(stagedDir)
    .filter((f) => f.toLowerCase().endsWith(".zip"))
    .sort();
  if (zips.length === 0) throw new Error(`No zips in ${stagedDir}`);

  const zone = requireEnv("BUNNY_STORAGE_ZONE_MUSIC_DOWNLOADS");
  const password = requireEnv("BUNNY_STORAGE_ZONE_MUSIC_DOWNLOADS_PASSWORD");

  const supabase = createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
  const { data: release, error: relErr } = await supabase
    .from("releases")
    .select("id, title")
    .eq("slug", slug)
    .single();
  if (relErr || !release) throw new Error(`No release with slug ${slug}`);

  const { data: sku } = await supabase
    .from("release_skus")
    .select("id, status")
    .eq("release_id", release.id)
    .eq("format", "digital")
    .single();
  if (!sku && !skipDb) {
    throw new Error(`Release ${slug} has no digital SKU to write paths onto`);
  }

  console.log(`Release : ${release.title} (${slug})`);
  console.log(`Staged  : ${stagedDir}`);
  console.log(`Zone    : ${zone} (token-auth)`);
  console.log(`SKU     : ${sku?.id ?? "none"}${sku ? ` [${sku.status}]` : ""}`);

  const existing = dryRun
    ? new Map<string, number>()
    : await remoteSizes(zone, password, `albums/${slug}`);

  const updates: Record<string, string> = {};
  for (const f of zips) {
    const fmt = formatOf(f);
    const local = join(stagedDir, f);
    const remotePath = `albums/${slug}/${f}`;
    if (!fmt) {
      console.log(`  SKIP ${f} (no recognizable _FORMAT.zip suffix)`);
      continue;
    }
    updates[FORMAT_COLUMN[fmt]] = remotePath;
    if (dryRun) {
      console.log(`  ${fmt.padEnd(4)} ${mb(statSync(local).size).padStart(9)}  -> ${remotePath}`);
      continue;
    }
    const already = force ? undefined : existing.get(f);
    if (already !== undefined) {
      console.log(`  ${fmt.padEnd(4)} already on Bunny (${mb(already)}), skipped`);
      continue;
    }
    const size = await upload(zone, password, remotePath, local);
    console.log(`  ${fmt.padEnd(4)} uploaded ${mb(size)} -> ${remotePath}`);
  }

  if (dryRun) {
    console.log("\n--dry-run: nothing uploaded, no row written.");
    console.log(`Would set on SKU: ${JSON.stringify(updates, null, 1)}`);
    return;
  }

  if (skipDb || !sku) {
    console.log("\nUploads done. SKU untouched (--skip-db).");
    return;
  }

  const { error } = await supabase.from("release_skus").update(updates).eq("id", sku.id);
  if (error) throw new Error(`SKU update: ${error.message}`);
  console.log(`\nSKU ${sku.id} updated with ${Object.keys(updates).length} download path(s).`);
  console.log("Release status and SKU status were not touched.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
