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
  console.error("Usage: npx tsx scripts/check-user.ts <email>");
  process.exit(1);
}

(async () => {
  const { data: usersList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  const user = usersList?.users.find((u) => u.email?.toLowerCase() === email);

  if (!user) {
    console.log("auth.users: NOT FOUND for", email);
  } else {
    console.log("auth.users:");
    console.log({
      id: user.id,
      email: user.email,
      email_confirmed_at: user.email_confirmed_at,
      confirmed_at: (user as { confirmed_at?: string }).confirmed_at,
      last_sign_in_at: user.last_sign_in_at,
      banned_until: (user as { banned_until?: string }).banned_until,
      created_at: user.created_at,
    });
  }

  const { data: lockout } = await supabase
    .from("user_lockouts")
    .select("*")
    .eq("email", email)
    .maybeSingle();
  console.log("\nuser_lockouts:", lockout || "(none)");

  const { data: attempts } = await supabase
    .from("auth_attempts")
    .select("created_at, action, success, reason, ip")
    .eq("email", email)
    .order("created_at", { ascending: false })
    .limit(10);
  console.log("\nauth_attempts (last 10):");
  console.table(attempts || []);

  const { data: audience } = await supabase
    .from("audience")
    .select("id, email, user_id, subscriber_status, first_seen_at, last_activity_at")
    .eq("email", email)
    .maybeSingle();
  console.log("\naudience:", audience || "(none)");

  if (user) {
    const { data: adminRow } = await supabase
      .from("admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();
    console.log("\nadmins row?:", !!adminRow);
  }
})();
