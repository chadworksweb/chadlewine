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
  const { data, error } = await supabase
    .from("product_images")
    .update({ is_hidden: false, needs_review: false, updated_at: new Date().toISOString() })
    .eq("id", "14b12427-413a-447f-991f-4641e40dfcf6")
    .select("id, is_hidden, needs_review");
  console.log("updated:", JSON.stringify(data, null, 2), "error:", error);
})();
