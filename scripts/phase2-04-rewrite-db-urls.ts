/**
 * Phase 2 — Step 4: DB URL rewrite.
 *
 *   observations.art_image_path    — Supabase → chadlewine-site-images (preserve filename)
 *   songs.art_image_path           — Supabase → chadlewine-site-images (preserve filename)
 *   art_pieces.image_path          — chadrising-art/<subfolder>/<file> → chadlewine-site-images/art-thumbnails/<file>
 *
 * Supports --dry-run to preview changes.
 * Skips the 1 broken art_pieces row whose source 404'd (left pointing at chadrising-art for manual fix).
 */

import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const DRY_RUN = process.argv.includes("--dry-run");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SUPABASE_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/observation-images/`;
const SITE_IMAGES_BASE = `${process.env.NEXT_PUBLIC_BUNNY_PULL_ZONE_SITE_IMAGES}/`;
const CHADRISING_ART_HOST = "chadrising-art.b-cdn.net";

function rewriteSupabaseToSiteImages(oldUrl: string): string | null {
  if (!oldUrl.startsWith(SUPABASE_BASE)) return null;
  // Preserve everything after the bucket name (includes subfolders + query string)
  const tail = oldUrl.slice(SUPABASE_BASE.length);
  return `${SITE_IMAGES_BASE}${tail}`;
}

function rewriteChadrisingArtToThumbnails(oldUrl: string): string | null {
  try {
    const u = new URL(oldUrl);
    if (u.hostname !== CHADRISING_ART_HOST) return null;
    const filename = u.pathname.split("/").filter(Boolean).pop();
    if (!filename) return null;
    return `${SITE_IMAGES_BASE}art-thumbnails/${filename}`;
  } catch {
    return null;
  }
}

async function rewriteTable<T extends { image_path?: string | null; art_image_path?: string | null }>(
  table: string,
  pk: string,
  col: string,
  transform: (v: string) => string | null
) {
  const { data, error } = await supabase.from(table).select(`${pk}, ${col}`);
  if (error) throw error;
  const rows = (data ?? []) as Record<string, unknown>[];

  const toUpdate: Array<{ pk: unknown; old: string; next: string }> = [];
  const unchanged: string[] = [];

  for (const r of rows) {
    const v = r[col];
    if (typeof v !== "string" || v.length === 0) continue;
    const next = transform(v);
    if (next === null) {
      unchanged.push(v);
      continue;
    }
    toUpdate.push({ pk: r[pk], old: v, next });
  }

  console.log(`\n=== ${table}.${col} ===`);
  console.log(`  to update:   ${toUpdate.length}`);
  console.log(`  unchanged:   ${unchanged.length}`);
  if (toUpdate.length) {
    console.log(`  sample: ${toUpdate[0].old}`);
    console.log(`       → ${toUpdate[0].next}`);
  }

  if (DRY_RUN) return { updated: 0, toUpdate: toUpdate.length };

  let updated = 0;
  for (const u of toUpdate) {
    const { error: upErr } = await supabase
      .from(table)
      .update({ [col]: u.next })
      .eq(pk, u.pk);
    if (upErr) {
      console.error(`  FAIL ${pk}=${u.pk}: ${upErr.message}`);
      continue;
    }
    updated++;
  }
  console.log(`  updated: ${updated}/${toUpdate.length}`);
  return { updated, toUpdate: toUpdate.length };
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "APPLY"}`);
  console.log(`From: ${SUPABASE_BASE}`);
  console.log(`To:   ${SITE_IMAGES_BASE}`);

  await rewriteTable("observations", "id", "art_image_path", rewriteSupabaseToSiteImages);
  await rewriteTable("songs", "id", "art_image_path", rewriteSupabaseToSiteImages);
  await rewriteTable("art_pieces", "id", "image_path", rewriteChadrisingArtToThumbnails);

  console.log(`\nDone${DRY_RUN ? " (dry run — no changes applied)" : ""}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
