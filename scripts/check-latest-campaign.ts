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
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id, subject, status, sent_count, failed_count, delivered_count, open_count, click_count, bounce_count, created_at, sent_at")
    .order("created_at", { ascending: false })
    .limit(1);
  if (!campaigns || campaigns.length === 0) {
    console.log("No campaigns yet.");
    return;
  }
  const c = campaigns[0];
  console.log("Latest campaign:");
  console.table([c]);

  const { data: sends } = await supabase
    .from("campaign_sends")
    .select("email, is_test, status, sent_at, delivered_at, opened_at, open_count, clicked_at, click_count, bounced_at, error")
    .eq("campaign_id", c.id)
    .order("sent_at", { ascending: true });
  console.log("\nSends:");
  console.table(sends || []);

  const { data: events } = await supabase
    .from("audience_events")
    .select("audience_id, event_type, occurred_at, metadata")
    .filter("metadata->>campaign_id", "eq", c.id)
    .order("occurred_at", { ascending: false })
    .limit(20);
  console.log("\nAudience events tied to this campaign:");
  console.table((events || []).map((e) => ({
    audience_id: e.audience_id,
    event_type: e.event_type,
    occurred_at: e.occurred_at,
  })));
})();
