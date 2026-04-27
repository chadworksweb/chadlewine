/**
 * Repoint albums.cover_art_path + singles.art_image_path at the new webp
 * URLs on chadlewine-site-images/cover-art-web/{slug}.webp.
 *
 * Usage:
 *   npx tsx scripts/phaseM-07-repoint-covers.ts --dry-run
 *   npx tsx scripts/phaseM-07-repoint-covers.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const PULL = process.env.NEXT_PUBLIC_BUNNY_PULL_ZONE_SITE_IMAGES!.replace(/\/+$/, "");

const ALBUM_SLUGS = [
  "demoesque", "the-human-link", "williamsburgadelphia", "life-as-a-student",
  "honeychrome", "daylight-animal", "all-the-right-places", "sprout",
  "feeling-high", "the-gap", "pivotal-days", "hyperising",
];
// dont-blame-me intentionally excluded (no new cover uploaded this pass)

const SINGLE_SLUGS = [
  "35", "boomerang", "choose-lit", "dark-nights",
  "hope-you-visit-soon-bro", "riptide-acoustic",
];

function webUrl(slug: string) {
  return `${PULL}/cover-art-web/${slug}.webp`;
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  console.log(`\n=== REPOINT COVERS (${dry ? "dry" : "apply"}) ===\n`);

  for (const slug of ALBUM_SLUGS) {
    const url = webUrl(slug);
    console.log(`  albums[${slug}].cover_art_path = ${url}`);
    if (!dry) {
      const { error } = await supabase.from("albums").update({ cover_art_path: url }).eq("slug", slug);
      if (error) console.error(`    FAIL: ${error.message}`);
    }
  }

  for (const slug of SINGLE_SLUGS) {
    const url = webUrl(slug);
    console.log(`  songs[${slug}].art_image_path = ${url}`);
    if (!dry) {
      const { error } = await supabase.from("songs").update({ art_image_path: url }).eq("slug", slug);
      if (error) console.error(`    FAIL: ${error.message}`);
    }
  }

  console.log(`\n${dry ? "Dry-run done" : "Applied"} — ${ALBUM_SLUGS.length} albums + ${SINGLE_SLUGS.length} singles`);
}

main().catch((e) => { console.error(e); process.exit(1); });
