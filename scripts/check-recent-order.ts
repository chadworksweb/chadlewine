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

const email = (process.argv[2] || "").trim().toLowerCase();
if (!email) {
  console.error("Usage: npx tsx scripts/check-recent-order.ts <email>");
  process.exit(1);
}

(async () => {
  const { data: orders } = await supabase
    .from("orders")
    .select("id, order_number, buyer_email, total, status, stripe_session_id, audience_id, created_at")
    .eq("buyer_email", email)
    .order("created_at", { ascending: false })
    .limit(5);
  console.log("Orders for", email, ":");
  console.table(orders || []);

  const { data: audience } = await supabase
    .from("audience")
    .select("id, email, user_id, stripe_customer_id, lifetime_orders, lifetime_spend, last_activity_at")
    .eq("email", email)
    .maybeSingle();
  console.log("\nAudience row:", audience || "(none)");

  if (audience) {
    const { data: tags } = await supabase
      .from("audience_tags")
      .select("tag, added_at")
      .eq("audience_id", audience.id);
    console.log("\nTags:", tags || []);

    const { data: events } = await supabase
      .from("audience_events")
      .select("event_type, metadata, occurred_at")
      .eq("audience_id", audience.id)
      .order("occurred_at", { ascending: false })
      .limit(10);
    console.log("\nEvents (last 10):");
    console.table((events || []).map((e) => ({
      event_type: e.event_type,
      occurred_at: e.occurred_at,
      metadata_summary: JSON.stringify(e.metadata || {}).slice(0, 60),
    })));
  }
})();
