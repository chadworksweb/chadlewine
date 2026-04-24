/**
 * Audit: count rows per image-bearing column that reference Supabase Storage
 * URLs. Tells us how much Phase 2 Step 3 (URL rewrite) actually has to rewrite.
 */
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const TABLES: Array<{ table: string; cols: string[]; pk?: string }> = [
  { table: "observations", cols: ["art_image_path", "art_fullres_print_path", "art_fullres_wallpaper_path"] },
  { table: "songs", cols: ["art_image_path"] },
  { table: "albums", cols: ["cover_art_path"] },
  { table: "art_pieces", cols: ["image_path"] },
  { table: "page_meta", cols: ["og_image_path"], pk: "route" },
  { table: "videos", cols: ["thumbnail_path"] },
];

async function main() {
  for (const { table, cols, pk } of TABLES) {
    const selectCols = [pk ?? "id", ...cols].join(",");
    const { data, error } = await supabase.from(table).select(selectCols);
    if (error) {
      console.log(`${table}: ERROR ${error.message}`);
      continue;
    }
    console.log(`\n=== ${table} (${data?.length ?? 0} rows) ===`);
    for (const col of cols) {
      const rows = (data ?? []) as Record<string, unknown>[];
      const set = rows.filter((r) => r[col] && typeof r[col] === "string" && (r[col] as string).length > 0);
      const supa = set.filter((r) => (r[col] as string).includes("supabase.co"));
      const other = set.filter((r) => !(r[col] as string).includes("supabase.co"));
      console.log(`  ${col}: total=${set.length}, supabase=${supa.length}, other=${other.length}`);
      const samples = set.slice(0, 2).map((r) => r[col]);
      for (const s of samples) console.log(`    e.g. ${s}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
