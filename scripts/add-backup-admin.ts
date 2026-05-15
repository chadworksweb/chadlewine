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
  console.error("Usage: npx tsx scripts/add-backup-admin.ts <email> <password>");
  process.exit(1);
}

(async () => {
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) {
    console.error("createUser failed:", createErr.message);
    process.exit(1);
  }
  const userId = created.user?.id;
  if (!userId) {
    console.error("createUser returned no user id");
    process.exit(1);
  }
  console.log("Auth user created:", userId);

  const { error: insertErr } = await supabase
    .from("admins")
    .insert({ user_id: userId });
  if (insertErr && !/duplicate/i.test(insertErr.message)) {
    console.error("admins insert failed:", insertErr.message);
    process.exit(1);
  }
  console.log("OK -", email, "is now an admin (user_id:", userId + ")");
})();
