/**
 * ingest-rc-classifications.ts
 * Read a Rising Compass backfill results JSON (produced by
 * rising-compass/backend/scripts/backfill_chadlewine_catalog.py) and write
 * its per-song classifications into the `songs` table columns
 * rc_tier / rc_charge / rc_charge_summary / rc_contaminated / rc_confidence
 * / rc_calibrated_at / rc_song_source / rc_song_id.
 *
 * Idempotent — rerunning with the same file just re-writes the same values.
 *
 * Usage:
 *   npx tsx scripts/ingest-rc-classifications.ts <path-to-results.json>
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const [key, ...valueParts] = line.split("=");
    if (key && valueParts.length > 0) {
      let value = valueParts.join("=").trim().replace(/\r$/, "");
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key.trim()] = value;
    }
  });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error("Usage: npx tsx scripts/ingest-rc-classifications.ts <results.json>");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface BackfillResult {
  song_id: string;
  title: string;
  status: "ok" | "skipped" | "failed";
  tier?: string;
  charge?: number;
  charge_summary?: string;
  contaminated?: boolean;
  confidence?: number;
  consensus?: { run_count?: number; charge_value?: number; rubric_color?: string; contaminated?: boolean } | null;
  rc_song_source?: string | null;
  rc_song_id?: number | null;
  reason?: string;
}

interface BackfillPayload {
  ran_at: string;
  source_tag: string;
  results: BackfillResult[];
}

async function main() {
  const raw = fs.readFileSync(jsonPath, "utf-8");
  const payload: BackfillPayload = JSON.parse(raw);

  console.log(`Reading: ${jsonPath}`);
  console.log(`  ran_at:     ${payload.ran_at}`);
  console.log(`  source_tag: ${payload.source_tag}`);
  console.log(`  rows:       ${payload.results.length}`);

  const okRows = payload.results.filter((r) => r.status === "ok");
  console.log(`  ok rows:    ${okRows.length}`);
  console.log("");

  let updated = 0;
  let failed = 0;
  const calibratedAt = payload.ran_at;

  for (let i = 0; i < okRows.length; i++) {
    const r = okRows[i];
    // Prefer consensus values when available (authoritative post-reconcile),
    // otherwise fall back to the single-run values.
    const tier = r.consensus?.rubric_color || r.tier || null;
    const charge = r.consensus?.charge_value ?? r.charge ?? null;
    const contaminated = r.consensus?.contaminated ?? r.contaminated ?? null;

    const update = {
      rc_tier: tier,
      rc_charge: charge,
      rc_charge_summary: r.charge_summary ?? null,
      rc_contaminated: contaminated,
      rc_confidence: r.confidence ?? null,
      rc_calibrated_at: calibratedAt,
      rc_song_source: r.rc_song_source ?? null,
      rc_song_id: r.rc_song_id ?? null,
    };

    const { error } = await supabase.from("songs").update(update).eq("id", r.song_id);
    if (error) {
      console.log(`[${i + 1}/${okRows.length}] ${r.title} ... ERROR: ${error.message}`);
      failed++;
    } else {
      const chargeStr = typeof charge === "number" ? (charge > 0 ? `+${charge}` : `${charge}`) : "?";
      console.log(`[${i + 1}/${okRows.length}] ${r.title} ... ${tier} / ${chargeStr}`);
      updated++;
    }
  }

  console.log("");
  console.log(`Done. Updated: ${updated}, Failed: ${failed}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
