// Set (or clear) the song that /fan-song serves and the drip emails point to.
//
//   npx tsx scripts/set-fan-ode-song.ts <slug>     # mark this song as the current ode
//   npx tsx scripts/set-fan-ode-song.ts --clear    # clear the current ode (page returns "between gifts")
//   npx tsx scripts/set-fan-ode-song.ts            # show what's currently active
//
// Only one song can be marked at a time (enforced by the partial unique
// index in 20260516130000_fan_ode_drip.sql). This script flips the flag
// off everywhere first, then flips it on for the target slug — so swaps
// are safe to run repeatedly.

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

async function showCurrent() {
  const { data } = await supabase
    .from("songs")
    .select("id, slug, title")
    .eq("is_current_fan_ode", true)
    .maybeSingle();
  if (data) {
    console.log(`Current fan-ode song: "${data.title}" (${data.slug})`);
  } else {
    console.log("No fan-ode song is currently set. /fan-song shows 'between gifts'.");
  }
}

async function clearCurrent() {
  const { error } = await supabase
    .from("songs")
    .update({ is_current_fan_ode: false })
    .eq("is_current_fan_ode", true);
  if (error) {
    console.error("Clear failed:", error.message);
    process.exit(1);
  }
  console.log("Cleared. /fan-song will show 'between gifts' until a new song is set.");
}

async function setBySlug(slug: string) {
  const { data: target } = await supabase
    .from("songs")
    .select("id, slug, title")
    .eq("slug", slug)
    .maybeSingle();
  if (!target) {
    console.error(`No song found with slug "${slug}".`);
    process.exit(1);
  }
  // Atomically swap by first clearing any prior flag, then setting on target.
  // The partial unique index would reject a parallel insert, but sequential
  // is fine for an admin script.
  const clearErr = await supabase
    .from("songs")
    .update({ is_current_fan_ode: false })
    .eq("is_current_fan_ode", true);
  if (clearErr.error) {
    console.error("Pre-clear failed:", clearErr.error.message);
    process.exit(1);
  }
  const { error: setErr } = await supabase
    .from("songs")
    .update({ is_current_fan_ode: true })
    .eq("id", target.id);
  if (setErr) {
    console.error("Set failed:", setErr.message);
    process.exit(1);
  }
  console.log(`Current fan-ode song is now: "${target.title}" (${target.slug})`);
}

(async () => {
  const arg = process.argv[2];
  if (!arg) {
    await showCurrent();
    return;
  }
  if (arg === "--clear") {
    await clearCurrent();
    return;
  }
  await setBySlug(arg);
})();
