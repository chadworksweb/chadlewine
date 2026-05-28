import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
    const [k, ...rest] = line.split("=");
    if (k && rest.length) process.env[k.trim()] = rest.join("=").trim();
  });
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

(async () => {
  // The tee
  const { data: tee } = await supabase
    .from("merch")
    .select("id, slug, title, image_url, linked_art_piece_id")
    .eq("slug", "urgent-arbiter-by-chad-lewine-tee")
    .maybeSingle();
  console.log("tee:", JSON.stringify(tee, null, 2));

  if (tee) {
    const { data: imgs } = await supabase
      .from("product_images")
      .select("id, position, is_primary, is_hidden, source, url, alt, printify_position")
      .eq("product_id", tee.id)
      .is("deleted_at", null)
      .order("position");
    console.log("\nproduct_images:");
    console.log(JSON.stringify(imgs, null, 2));
  }
})();
