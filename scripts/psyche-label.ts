/**
 * psyche-label.ts
 *
 * Terminal mechanism for the Psyche Facts label's authored layer
 * (songs.label_meta / releases.label_meta). NO model/LLM API is called here.
 * Claude Code is the model: run `show` to print the Rising Compass inputs, then
 * (in the Claude Code session) write the prescription copy in Chad's voice into
 * a JSON file, and `write` validates + stores it. The RC-derived fields (tier,
 * charge, listener + societal prose) are NOT stored here; they render live from
 * the badge fetch. This jsonb is only the authored prescription voice.
 *
 * Commands:
 *   show  <slug> [--release]               Print RC inputs + current label_meta + skeleton.
 *   write <slug> <file.json> [--release]   Validate + store label_meta (file or "-" for stdin).
 *   clear <slug> [--release]               Set label_meta = null.
 *
 * Usage:
 *   npx tsx scripts/psyche-label.ts show everything-i-need
 *   npx tsx scripts/psyche-label.ts write everything-i-need "%TEMP%\label.json"
 *   npx tsx scripts/psyche-label.ts clear everything-i-need
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

// --- env: inline .env.local parse (mirrors the other scripts) ---
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
    const [k, ...r] = line.split("=");
    if (k && r.length) process.env[k.trim()] = r.join("=").trim();
  });
}

const RC_URL = process.env.RISING_COMPASS_API_URL || "https://api.risingcompass.net";
const RC_KEY = process.env.RISING_COMPASS_SERVICE_KEY || process.env.RISING_COMPASS_API_KEY;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

// --- pinned label_meta schema ---
const STRING_KEYS = ["purpose", "do_not_use_if", "directions", "onset", "duration", "warning"] as const;
const ARRAY_KEYS = ["indicated_for", "effects", "at_scale"] as const;
const ALLOWED = new Set<string>([...STRING_KEYS, ...ARRAY_KEYS]);

type LabelMeta = Record<string, string | string[]>;

function skeleton(): string {
  return JSON.stringify(
    {
      purpose: "",
      indicated_for: [],
      do_not_use_if: "",
      directions: "",
      onset: "",
      duration: "",
      warning: "",
      effects: [],
      at_scale: [],
    },
    null,
    2,
  );
}

function cleanMeta(input: unknown): { meta: LabelMeta; warnings: string[] } {
  const warnings: string[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Label JSON must be a single object of fields.");
  }
  const obj = input as Record<string, unknown>;
  const meta: LabelMeta = {};
  for (const key of Object.keys(obj)) {
    if (!ALLOWED.has(key)) {
      warnings.push(`Unknown key dropped: ${key}`);
      continue;
    }
    const val = obj[key];
    if ((STRING_KEYS as readonly string[]).includes(key)) {
      if (typeof val !== "string") {
        warnings.push(`${key} must be a string; dropped.`);
        continue;
      }
      const t = val.trim();
      if (t) meta[key] = t;
    } else {
      if (!Array.isArray(val)) {
        warnings.push(`${key} must be an array of strings; dropped.`);
        continue;
      }
      const arr = val.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
      if (arr.length) meta[key] = arr;
    }
  }
  return { meta, warnings };
}

interface Badge {
  tier?: string;
  tier_label?: string;
  tier_hex?: string;
  charge?: number;
  charge_summary?: string | null;
  deadpan_line?: string | null;
  topics?: string[] | null;
  listener_effects_prose?: string | null;
  societal_effects_prose?: string | null;
}

async function fetchBadge(title: string, album: boolean): Promise<Badge | null> {
  if (!RC_KEY) return null;
  const endpoint = album ? "album-lookup" : "lookup";
  const params = new URLSearchParams({ title, artist: ARTIST });
  try {
    const res = await fetch(`${RC_URL}/api/badge/${endpoint}?${params}`, {
      headers: { "X-Api-Key": RC_KEY },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as Badge;
  } catch {
    return null;
  }
}

interface Row {
  id: string;
  title: string;
  slug: string;
  label_meta: LabelMeta | null;
}

async function loadRow(table: "songs" | "releases", slug: string): Promise<Row | null> {
  const { data, error } = await supabase
    .from(table)
    .select("id, title, slug, label_meta")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    console.error(`DB error: ${error.message}`);
    process.exit(1);
  }
  return (data as Row) || null;
}

function readJsonArg(fileArg: string): unknown {
  const raw = fileArg === "-" ? fs.readFileSync(0, "utf-8") : fs.readFileSync(fileArg, "utf-8");
  return JSON.parse(raw);
}

function hr(label: string) {
  console.log(`\n--- ${label} ${"-".repeat(Math.max(0, 56 - label.length))}`);
}

async function cmdShow(table: "songs" | "releases", slug: string) {
  const row = await loadRow(table, slug);
  if (!row) {
    console.error(`No ${table} row with slug "${slug}".`);
    process.exit(1);
  }
  console.log(`${table === "releases" ? "Release" : "Song"}: ${row.title}  (slug: ${row.slug})`);

  const badge = await fetchBadge(row.title, table === "releases");
  hr("Rising Compass inputs");
  if (!badge) {
    console.log(RC_KEY ? "(no RC badge match / RC unreachable)" : "(RC_KEY not set in .env.local)");
  } else {
    console.log(`tier:           ${badge.tier_label ?? badge.tier ?? "-"}  (${badge.tier ?? "-"}, ${badge.tier_hex ?? "-"})`);
    console.log(`charge:         ${badge.charge ?? "-"}`);
    console.log(`charge_summary: ${badge.charge_summary ?? "-"}`);
    console.log(`deadpan_line:   ${badge.deadpan_line ?? "-"}`);
    console.log(`topics:         ${Array.isArray(badge.topics) ? badge.topics.join(", ") : "-"}`);
    hr("listener_effects_prose (-> Effects, per listen)");
    console.log(badge.listener_effects_prose ?? "(none)");
    hr("societal_effects_prose (-> At scale)");
    console.log(badge.societal_effects_prose ?? "(none)");
  }

  hr("current label_meta");
  console.log(row.label_meta ? JSON.stringify(row.label_meta, null, 2) : "(none)");

  hr("authored skeleton (fill, save to a temp .json, then `write`)");
  console.log(skeleton());
}

async function cmdWrite(table: "songs" | "releases", slug: string, fileArg: string) {
  const parsed = readJsonArg(fileArg);
  const { meta, warnings } = cleanMeta(parsed);
  warnings.forEach((w) => console.warn(`! ${w}`));
  if (Object.keys(meta).length === 0) {
    console.error("Nothing to write (every field was empty or invalid).");
    process.exit(1);
  }
  const row = await loadRow(table, slug);
  if (!row) {
    console.error(`No ${table} row with slug "${slug}".`);
    process.exit(1);
  }
  const { error } = await supabase.from(table).update({ label_meta: meta }).eq("id", row.id);
  if (error) {
    console.error(`Write failed: ${error.message}`);
    process.exit(1);
  }
  console.log(`Wrote label_meta to ${table} "${row.title}" (${row.slug}):`);
  console.log(JSON.stringify(meta, null, 2));
}

async function cmdClear(table: "songs" | "releases", slug: string) {
  const row = await loadRow(table, slug);
  if (!row) {
    console.error(`No ${table} row with slug "${slug}".`);
    process.exit(1);
  }
  const { error } = await supabase.from(table).update({ label_meta: null }).eq("id", row.id);
  if (error) {
    console.error(`Clear failed: ${error.message}`);
    process.exit(1);
  }
  console.log(`Cleared label_meta on ${table} "${row.title}" (${row.slug}).`);
}

function usage(): never {
  console.error(
    [
      "Usage:",
      "  npx tsx scripts/psyche-label.ts show  <slug> [--release]",
      "  npx tsx scripts/psyche-label.ts write <slug> <file.json|-> [--release]",
      "  npx tsx scripts/psyche-label.ts clear <slug> [--release]",
    ].join("\n"),
  );
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  const release = args.includes("--release");
  const positional = args.filter((a) => !a.startsWith("--"));
  const [cmd, slug, file] = positional;
  const table: "songs" | "releases" = release ? "releases" : "songs";

  if (!cmd || !slug) usage();

  if (cmd === "show") await cmdShow(table, slug);
  else if (cmd === "write") {
    if (!file) {
      console.error("write requires a JSON file path (or - for stdin).");
      process.exit(1);
    }
    await cmdWrite(table, slug, file);
  } else if (cmd === "clear") await cmdClear(table, slug);
  else usage();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
