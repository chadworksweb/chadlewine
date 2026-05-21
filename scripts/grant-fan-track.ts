// Manually grant a fan_track to one or more emails. Prints each tokenized
// URL so you can paste it into a one-off message if needed.
//
//   npx tsx scripts/grant-fan-track.ts <slug> <email1> [email2] ...
//   npx tsx scripts/grant-fan-track.ts for-my-fans-01 chad@chadworks.co

import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8")
    .split("\n")
    .forEach((line) => {
      const [k, ...rest] = line.split("=");
      if (k && rest.length) process.env[k.trim()] = rest.join("=").trim();
    });
}

function generateGrantToken(): string {
  return randomBytes(24)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

(async () => {
  const [slug, ...emails] = process.argv.slice(2);
  if (!slug || emails.length === 0) {
    console.error("Usage: npx tsx scripts/grant-fan-track.ts <slug> <email1> [email2] ...");
    process.exit(1);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://chadlewine.com";

  const { data: track } = await supabase
    .from("fan_tracks")
    .select("id, slug, title")
    .eq("slug", slug)
    .maybeSingle();
  if (!track) {
    console.error(`Track not found: ${slug}`);
    process.exit(1);
  }

  for (const rawEmail of emails) {
    const email = rawEmail.trim().toLowerCase();
    const { data: audience } = await supabase
      .from("audience")
      .select("id, email, user_id")
      .eq("email", email)
      .maybeSingle();
    if (!audience) {
      console.log(`[skip] ${email} -- no audience row`);
      continue;
    }

    // Idempotent -- if a grant already exists, fetch it; otherwise mint.
    const { data: existing } = await supabase
      .from("fan_track_grants")
      .select("id, token")
      .eq("fan_track_id", track.id)
      .eq("audience_id", audience.id)
      .maybeSingle();

    let token: string;
    if (existing) {
      token = existing.token;
      console.log(`[exists] ${email}`);
    } else {
      token = generateGrantToken();
      const { error } = await supabase.from("fan_track_grants").insert({
        fan_track_id: track.id,
        audience_id: audience.id,
        token,
        granted_via: "manual",
      });
      if (error) {
        console.error(`[error] ${email}: ${error.message}`);
        continue;
      }
      await supabase.rpc("upsert_audience_event", {
        p_audience_id: audience.id,
        p_event_type: "fan_track_granted",
        p_metadata: { fan_track_id: track.id, granted_via: "manual" },
      });
      console.log(`[granted] ${email}`);
    }

    const accountNote = audience.user_id ? "" : "  (no account yet -- recipient must register first)";
    console.log(`  ${siteUrl}/${slug}?token=${encodeURIComponent(token)}${accountNote}`);
  }
})();
