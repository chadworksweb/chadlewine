import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data, error } = await supabase
    .from("observations")
    .select("slug, art_image_path, art_fullres_print_path, art_fullres_wallpaper_path")
    .or("art_fullres_print_path.not.is.null,art_fullres_wallpaper_path.not.is.null");
  if (error) throw error;
  console.log(`observations with fullres set: ${data?.length ?? 0}`);
  for (const row of data ?? []) {
    console.log(JSON.stringify(row));
  }

  // Also list any other storage buckets to make sure we're not missing content
  const { data: buckets } = await supabase.storage.listBuckets();
  console.log("\nAll Storage buckets:");
  for (const b of buckets ?? []) {
    console.log(` - ${b.name} (public=${b.public})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
