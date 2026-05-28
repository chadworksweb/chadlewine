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
  const { data: imgs } = await supabase
    .from("product_images")
    .select("id, product_id, url, source, is_hidden, printify_position")
    .ilike("url", "%images-api.printify.com%")
    .is("deleted_at", null);

  const byPos = new Map<string, number>();
  for (const r of (imgs || [])) {
    const p = r.printify_position || "(null)";
    byPos.set(p, (byPos.get(p) || 0) + 1);
  }
  console.log("printify_position distribution across the 84 affected rows:");
  for (const [k, v] of [...byPos.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${v.toString().padStart(3)}  ${k}`);
  }
})();
