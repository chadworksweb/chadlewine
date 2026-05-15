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
  console.error("Usage: npx tsx scripts/clear-stripe-customer.ts <email>");
  process.exit(1);
}

(async () => {
  const { data: row, error } = await supabase
    .from("audience")
    .update({ stripe_customer_id: null, updated_at: new Date().toISOString() })
    .eq("email", email)
    .select("id, email, stripe_customer_id");
  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  console.log("cleared:", row);
})();
