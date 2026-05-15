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

const tag = (process.argv[2] || "").trim();
if (!tag) {
  console.error("Usage: npx tsx scripts/check-tag-audience.ts <tag>");
  process.exit(1);
}

(async () => {
  const { data: tagRows } = await supabase
    .from("audience_tags")
    .select("audience_id")
    .eq("tag", tag);
  const ids = (tagRows || []).map((r) => r.audience_id);
  if (ids.length === 0) {
    console.log("No audience members carry tag:", tag);
    return;
  }
  const { data: members } = await supabase
    .from("audience")
    .select("id, email, subscriber_status, lifetime_orders, lifetime_spend, last_activity_at")
    .in("id", ids)
    .eq("subscriber_status", "active");
  console.log(`Active subscribers with tag '${tag}':`);
  console.table(members || []);
})();
