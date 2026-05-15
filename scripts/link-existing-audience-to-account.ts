/* Provision an auth.users row for an email that already has an audience
   row (typically from guest checkouts), then link the existing audience
   to the new account. The user becomes a regular member (no admins
   insert). Idempotent: re-running on an existing user just re-links.

   Usage:
     npx tsx scripts/link-existing-audience-to-account.ts <email> <password>
*/

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
const password = process.argv[3] || "";
if (!email || !password) {
  console.error("Usage: npx tsx scripts/link-existing-audience-to-account.ts <email> <password>");
  process.exit(1);
}

(async () => {
  const { data: audience } = await supabase
    .from("audience")
    .select("id, email, user_id")
    .eq("email", email)
    .maybeSingle();
  if (!audience) {
    console.error("No existing audience row for", email);
    process.exit(1);
  }
  console.log("Audience:", audience.id, "(current user_id:", audience.user_id, ")");

  const { data: usersList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 500 });
  const existing = usersList?.users.find((u) => u.email?.toLowerCase() === email);

  let userId: string;
  if (existing) {
    console.log("Auth user already exists:", existing.id);
    const { error: pwErr } = await supabase.auth.admin.updateUserById(existing.id, { password });
    if (pwErr) {
      console.error("Password update failed:", pwErr.message);
      process.exit(1);
    }
    console.log("Password updated.");
    userId = existing.id;
  } else {
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created.user?.id) {
      console.error("createUser failed:", createErr?.message);
      process.exit(1);
    }
    userId = created.user.id;
    console.log("Auth user created:", userId);
  }

  if (audience.user_id !== userId) {
    const { error: linkErr } = await supabase
      .from("audience")
      .update({ user_id: userId, updated_at: new Date().toISOString() })
      .eq("id", audience.id);
    if (linkErr) {
      console.error("Audience link update failed:", linkErr.message);
      process.exit(1);
    }
    console.log("Audience linked to user_id:", userId);
  } else {
    console.log("Audience already linked.");
  }

  await supabase.from("user_lockouts").delete().eq("email", email);
  console.log("\nOK -", email, "can now sign in at /account/login");
})();
