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
  console.error("Usage: npx tsx scripts/set-user-password.ts <email> <password>");
  process.exit(1);
}

(async () => {
  const { data: usersList, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listErr) {
    console.error("listUsers failed:", listErr.message);
    process.exit(1);
  }
  const user = usersList?.users.find((u) => u.email?.toLowerCase() === email);
  if (!user) {
    console.error("User not found for", email);
    process.exit(1);
  }

  const { error } = await supabase.auth.admin.updateUserById(user.id, { password });
  if (error) {
    console.error("updateUserById failed:", error.message);
    process.exit(1);
  }

  // Clear any lockout/failure tracking so the user isn't blocked.
  await supabase.from("user_lockouts").delete().eq("email", email);

  console.log("OK — password updated and lockout cleared for", email);
})();
