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

const slug = (process.argv[2] || "").trim();
if (!slug) {
  console.error("Usage: npx tsx scripts/_check-merch-images.ts <slug>");
  process.exit(1);
}

(async () => {
  const { data: m } = await supabase
    .from("merch")
    .select("id, slug, title, status")
    .eq("slug", slug)
    .maybeSingle();
  if (!m) {
    console.log("product not found:", slug);
    return;
  }
  console.log("product:", m);

  const { data: imgs } = await supabase
    .from("product_images")
    .select("id, position, is_primary, is_hidden, needs_review, deleted_at, source, url, alt")
    .eq("product_id", m.id)
    .order("is_primary", { ascending: false })
    .order("position", { ascending: true });
  console.log("images:", JSON.stringify(imgs, null, 2));
})();
