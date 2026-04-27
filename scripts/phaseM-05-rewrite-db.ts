/**
 * Rewrite DB paths on albums + songs per phaseM-02-mapping.out.json.
 *
 * Public zones (cover-art, music-streaming)  → store full URL on the pull-zone host.
 * Token-auth zone (music-downloads)           → store RAW path; /api/download/[token]
 *                                               signs at request time.
 *
 * Usage:
 *   npx tsx scripts/phaseM-05-rewrite-db.ts --dry-run   # print planned updates
 *   npx tsx scripts/phaseM-05-rewrite-db.ts             # apply
 *   npx tsx scripts/phaseM-05-rewrite-db.ts --only SLUG # only one release
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const COVER_ART_PULL = requireEnv("NEXT_PUBLIC_BUNNY_PULL_ZONE_COVER_ART");
const MUSIC_STREAMING_PULL = requireEnv("NEXT_PUBLIC_BUNNY_PULL_ZONE_MUSIC_STREAMING");
// music-downloads is token-auth; we store raw paths, not URLs

function requireEnv(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env: ${k}`);
  return v;
}

type Zone = "cover-art" | "music-streaming" | "music-downloads";

type MappingEntry = {
  source: string;
  sourceBytes: number;
  zone: Zone;
  targetPath: string;
  target:
    | { kind: "album"; albumId: string; albumSlug: string; column: "cover_art_path" | "download_path_mp3" | "download_path_flac" | "download_path_wav" }
    | { kind: "song"; songId: string; songSlug: string; albumSlug: string | null; column: "streaming_path" | "download_path_mp3" | "download_path_flac" | "download_path_wav" };
};

function fullUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function dbValueFor(e: MappingEntry): string {
  if (e.zone === "cover-art") return fullUrl(COVER_ART_PULL, e.targetPath);
  if (e.zone === "music-streaming") return fullUrl(MUSIC_STREAMING_PULL, e.targetPath);
  // token-auth: store raw path
  return e.targetPath.replace(/^\/+/, "");
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const onlyIdx = args.indexOf("--only");
  const onlyFilter = onlyIdx >= 0 ? args[onlyIdx + 1] : null;

  const mappingData = JSON.parse(readFileSync("scripts/phaseM-02-mapping.out.json", "utf8")) as {
    mapping: MappingEntry[];
  };

  let entries = mappingData.mapping;
  if (onlyFilter) {
    entries = entries.filter((e) => {
      const slug = e.target.kind === "album" ? e.target.albumSlug : e.target.songSlug;
      return slug === onlyFilter;
    });
  }

  console.log(`\n=== DB REWRITE ===`);
  console.log(`  Dry-run: ${dryRun}`);
  console.log(`  Only: ${onlyFilter ?? "(all)"}`);
  console.log(`  Entries: ${entries.length}\n`);

  // Group by (kind, id) to do one update per row with all columns patched at once.
  type Patch = { table: "albums" | "songs"; id: string; values: Record<string, string>; label: string };
  const patches = new Map<string, Patch>();
  for (const e of entries) {
    const value = dbValueFor(e);
    if (e.target.kind === "album") {
      const key = `albums:${e.target.albumId}`;
      const p = patches.get(key) ?? {
        table: "albums" as const,
        id: e.target.albumId,
        values: {},
        label: e.target.albumSlug,
      };
      p.values[e.target.column] = value;
      patches.set(key, p);
    } else {
      const key = `songs:${e.target.songId}`;
      const p = patches.get(key) ?? {
        table: "songs" as const,
        id: e.target.songId,
        values: {},
        label: e.target.songSlug,
      };
      p.values[e.target.column] = value;
      patches.set(key, p);
    }
  }

  console.log(`  Unique rows to update: ${patches.size}\n`);
  for (const p of patches.values()) {
    console.log(`  [${p.table}] ${p.label} (${p.id.slice(0, 8)}…)`);
    for (const [col, val] of Object.entries(p.values)) {
      console.log(`      ${col} = ${val}`);
    }
  }

  if (dryRun) return;

  let ok = 0, fail = 0;
  for (const p of patches.values()) {
    const { error } = await supabase.from(p.table).update(p.values).eq("id", p.id);
    if (error) {
      console.error(`  FAIL [${p.table}] ${p.label}: ${error.message}`);
      fail++;
    } else {
      ok++;
    }
  }
  console.log(`\n=== DONE ===`);
  console.log(`  ok:   ${ok}`);
  console.log(`  fail: ${fail}`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
