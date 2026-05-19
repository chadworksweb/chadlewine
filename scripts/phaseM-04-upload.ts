/**
 * Upload every entry in phaseM-02-mapping.out.json to Bunny.
 *
 * Usage:
 *   npx tsx scripts/phaseM-04-upload.ts --dry-run       # print what would upload
 *   npx tsx scripts/phaseM-04-upload.ts --zone cover-art  # one zone only
 *   npx tsx scripts/phaseM-04-upload.ts --only SLUG      # one release only
 *   npx tsx scripts/phaseM-04-upload.ts                  # execute all
 *
 * Skips files already present in the target zone (HEAD check) unless --force.
 */
import { createReadStream, readFileSync, statSync } from "fs";
import { Readable } from "stream";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const STORAGE_HOSTNAME = process.env.BUNNY_STORAGE_HOSTNAME ?? "ny.storage.bunnycdn.com";

type Zone = "cover-art" | "music-streaming" | "music-downloads";

type ZoneConfig = {
  storageZone: string;
  storagePassword: string;
  pullZoneUrl: string;
};

const ZONES: Record<Zone, ZoneConfig> = {
  "cover-art": {
    storageZone: requireEnv("BUNNY_STORAGE_ZONE_COVER_ART"),
    storagePassword: requireEnv("BUNNY_STORAGE_ZONE_COVER_ART_PASSWORD"),
    pullZoneUrl: requireEnv("NEXT_PUBLIC_BUNNY_PULL_ZONE_COVER_ART"),
  },
  "music-streaming": {
    storageZone: requireEnv("BUNNY_STORAGE_ZONE_MUSIC_STREAMING"),
    storagePassword: requireEnv("BUNNY_STORAGE_ZONE_MUSIC_STREAMING_PASSWORD"),
    pullZoneUrl: requireEnv("NEXT_PUBLIC_BUNNY_PULL_ZONE_MUSIC_STREAMING"),
  },
  "music-downloads": {
    storageZone: requireEnv("BUNNY_STORAGE_ZONE_MUSIC_DOWNLOADS"),
    storagePassword: requireEnv("BUNNY_STORAGE_ZONE_MUSIC_DOWNLOADS_PASSWORD"),
    pullZoneUrl: requireEnv("BUNNY_PULL_ZONE_MUSIC_DOWNLOADS"),
  },
};

function requireEnv(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}

type MappingEntry = {
  source: string;
  sourceBytes: number;
  zone: Zone;
  targetPath: string;
  target: {
    kind: "album" | "song";
    albumId?: string;
    songId?: string;
    albumSlug?: string | null;
    songSlug?: string;
    column: string;
  };
  note?: string;
};

function fmtSize(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)}MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)}GB`;
}

function storageUrl(zone: ZoneConfig, path: string): string {
  return `https://${STORAGE_HOSTNAME}/${zone.storageZone}/${path.replace(/^\/+/, "")}`;
}

function mimeOf(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".flac")) return "audio/flac";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".zip")) return "application/zip";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

async function headExists(zone: ZoneConfig, path: string, expectedSize: number): Promise<boolean> {
  const url = storageUrl(zone, path);
  const res = await fetch(url, {
    method: "HEAD",
    headers: { AccessKey: zone.storagePassword },
  });
  if (res.status === 404) return false;
  if (!res.ok) return false;
  const cl = Number(res.headers.get("Content-Length") ?? 0);
  return expectedSize >= 0 && cl === expectedSize;
}

async function uploadFile(zone: ZoneConfig, path: string, src: string, mime: string): Promise<void> {
  const url = storageUrl(zone, path);
  // For medium-to-large files, stream rather than loading into memory.
  const stat = statSync(src);
  const stream = Readable.toWeb(createReadStream(src)) as unknown as ReadableStream;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      AccessKey: zone.storagePassword,
      "Content-Type": mime,
      "Content-Length": String(stat.size),
    },
    // @ts-expect-error: duplex required for stream body on node fetch
    duplex: "half",
    body: stream,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} — ${text.slice(0, 200)}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const zoneIdx = args.indexOf("--zone");
  const zoneFilter = zoneIdx >= 0 ? (args[zoneIdx + 1] as Zone) : null;
  const onlyIdx = args.indexOf("--only");
  const onlyFilter = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

  const mappingData = JSON.parse(readFileSync("scripts/phaseM-02-mapping.out.json", "utf8")) as {
    mapping: MappingEntry[];
    warnings: string[];
    unmatchedFiles: string[];
    unmatchedSongs: unknown[];
  };

  let entries = mappingData.mapping;
  if (zoneFilter) entries = entries.filter((e) => e.zone === zoneFilter);
  if (onlyFilter) {
    entries = entries.filter((e) => {
      const slug = e.target.albumSlug ?? e.target.songSlug;
      return slug === onlyFilter;
    });
  }

  console.log(`\n=== UPLOAD ===`);
  console.log(`  Dry-run: ${dryRun}   Force: ${force}`);
  console.log(`  Zone filter: ${zoneFilter ?? "(all)"}`);
  console.log(`  Only filter: ${onlyFilter ?? "(all)"}`);
  console.log(`  Entries: ${entries.length}`);
  const totalBytes = entries.reduce((n, e) => n + Math.max(0, e.sourceBytes), 0);
  console.log(`  Total: ${fmtSize(totalBytes)}\n`);

  if (dryRun) {
    for (const e of entries) {
      console.log(`  [${e.zone}] ${e.targetPath}  ← ${e.source}  (${fmtSize(e.sourceBytes)})`);
    }
    return;
  }

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let bytesUp = 0;
  const started = Date.now();
  for (const e of entries) {
    const zone = ZONES[e.zone];
    const label = `[${e.zone}] ${e.targetPath}`;
    try {
      if (!force) {
        const exists = await headExists(zone, e.targetPath, e.sourceBytes);
        if (exists) {
          skipped++;
          process.stdout.write(`  SKIP ${label}  (already present, bytes match)\n`);
          continue;
        }
      }
      const t = Date.now();
      await uploadFile(zone, e.targetPath, e.source, mimeOf(e.source));
      const elapsed = (Date.now() - t) / 1000;
      const mbs = e.sourceBytes / 1024 / 1024 / elapsed;
      uploaded++;
      bytesUp += e.sourceBytes;
      process.stdout.write(`  UP   ${label}  (${fmtSize(e.sourceBytes)} in ${elapsed.toFixed(1)}s, ${mbs.toFixed(1)} MB/s)\n`);
    } catch (err) {
      failed++;
      process.stdout.write(`  FAIL ${label}  — ${(err as Error).message}\n`);
    }
  }
  const total = (Date.now() - started) / 1000;
  console.log(`\n=== DONE ===`);
  console.log(`  uploaded: ${uploaded}  (${fmtSize(bytesUp)})`);
  console.log(`  skipped:  ${skipped}`);
  console.log(`  failed:   ${failed}`);
  console.log(`  total:    ${total.toFixed(1)}s`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
