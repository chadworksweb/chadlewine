/**
 * rc-backfill.ts
 *
 * One-time backfill: pulls Rising Compass classification for every chadlewine
 * song via /api/badge/lookup and stores the result in songs.rc_* + logs each
 * call to rc_sync_log.
 *
 * Use this until RC's webhook (Q1) is wired. Re-run safe: each call upserts
 * the latest classification on top of whatever's there.
 *
 * Usage:
 *   npx tsx scripts/rc-backfill.ts --dry-run
 *   npx tsx scripts/rc-backfill.ts
 *   npx tsx scripts/rc-backfill.ts --concurrency 3
 *
 * Requires in .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   RISING_COMPASS_API_URL (defaults to https://api.risingcompass.net)
 *   RISING_COMPASS_API_KEY or RISING_COMPASS_SERVICE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const ARTIST = "Chad Lewine";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const concIdx = args.indexOf("--concurrency");
const concurrency = concIdx >= 0 ? parseInt(args[concIdx + 1], 10) || 4 : 4;

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
    const [k, ...r] = line.split("=");
    if (k && r.length) process.env[k.trim()] = r.join("=").trim();
  });
}

const RC_URL = process.env.RISING_COMPASS_API_URL || "https://api.risingcompass.net";
const RC_KEY = process.env.RISING_COMPASS_SERVICE_KEY || process.env.RISING_COMPASS_API_KEY;
if (!RC_KEY) {
  console.error("Missing RISING_COMPASS_API_KEY (or RISING_COMPASS_SERVICE_KEY) in .env.local");
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Badge = {
  tier: string;
  charge: number;
  charge_summary: string | null;
  contaminated: boolean;
  pending?: boolean;
  song_slug?: string | null;
};

async function fetchBadge(title: string): Promise<Badge | null> {
  const params = new URLSearchParams({ title, artist: ARTIST });
  const url = `${RC_URL}/api/badge/lookup?${params}`;
  try {
    const res = await fetch(url, {
      headers: { "X-Api-Key": RC_KEY! },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as Badge;
  } catch {
    return null;
  }
}

type Song = { id: string; title: string; slug: string };

async function processOne(song: Song): Promise<{ ok: boolean; reason?: string; charge?: number; tier?: string }> {
  const badge = await fetchBadge(song.title);
  if (!badge) return { ok: false, reason: "no badge" };
  if (badge.charge == null || badge.tier == null) return { ok: false, reason: "incomplete badge" };

  if (dryRun) {
    return { ok: true, charge: badge.charge, tier: badge.tier };
  }

  const calibratedAt = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("songs")
    .update({
      rc_tier: badge.tier,
      rc_charge: badge.charge,
      rc_charge_summary: badge.charge_summary,
      rc_contaminated: badge.contaminated,
      rc_calibrated_at: calibratedAt,
    })
    .eq("id", song.id);

  if (updErr) return { ok: false, reason: updErr.message };

  await supabase.from("rc_sync_log").insert({
    song_id: song.id,
    action: "initial-ingest",
    payload: {
      title: song.title,
      slug: song.slug,
      badge,
      backfill_run: true,
    },
  });

  return { ok: true, charge: badge.charge, tier: badge.tier };
}

async function runWithConcurrency<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

async function main() {
  const { data: songs, error } = await supabase
    .from("songs")
    .select("id,title,slug")
    .order("title");
  if (error || !songs) {
    console.error("Failed to load songs:", error?.message);
    process.exit(1);
  }

  console.log(
    `${dryRun ? "[DRY-RUN] " : ""}Backfilling RC classification for ${songs.length} songs (concurrency=${concurrency})…`
  );

  let okCount = 0;
  let missCount = 0;
  let errCount = 0;
  const errors: { title: string; reason: string }[] = [];

  let done = 0;
  const results = await runWithConcurrency(songs, concurrency, async (s) => {
    const r = await processOne(s);
    done++;
    if (done % 10 === 0 || done === songs.length) {
      process.stdout.write(`\r  progress: ${done}/${songs.length}`);
    }
    if (r.ok) {
      okCount++;
    } else if (r.reason === "no badge" || r.reason === "incomplete badge") {
      missCount++;
    } else {
      errCount++;
      errors.push({ title: s.title, reason: r.reason ?? "unknown" });
    }
    return r;
  });

  console.log("");
  console.log(`\n${dryRun ? "[DRY-RUN] " : ""}Done.`);
  console.log(`  Updated: ${okCount}`);
  console.log(`  No RC badge match: ${missCount}`);
  console.log(`  Errors: ${errCount}`);
  if (errors.length) {
    console.log(`\nErrors:`);
    errors.slice(0, 20).forEach((e) => console.log(`  - ${e.title}: ${e.reason}`));
  }

  // Summary stats from the data
  if (!dryRun && okCount > 0) {
    const tiers: Record<string, number> = {};
    let charges = 0;
    let chargeSum = 0;
    for (const r of results) {
      if (r.ok && r.tier) tiers[r.tier] = (tiers[r.tier] ?? 0) + 1;
      if (r.ok && typeof r.charge === "number") { chargeSum += r.charge; charges++; }
    }
    console.log(`\nTier distribution: ${JSON.stringify(tiers)}`);
    if (charges) console.log(`Mean charge: ${(chargeSum / charges).toFixed(1)}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
