// Bulk-publish the Chad Lewine catalog's plain lyrics to LRCLIB.
//
// LRCLIB has an open publish API gated by a SHA-256 proof-of-work token.
// Algorithm (from the official server, server/src/utils.rs verify_answer):
//   token = `${prefix}:${nonce}` where SHA256(prefix + nonce) bytes <= target bytes.
// Base target 000000FF... = 24 leading zero bits (~16M hashes per solve).
//
// Usage (from repo root):
//   node --env-file=.env.local scripts/lrclib/publish.mjs               # DRY RUN: list what would publish
//   node --env-file=.env.local scripts/lrclib/publish.mjs --song <slug> # LIVE single-song smoke test
//   node --env-file=.env.local scripts/lrclib/publish.mjs --live        # LIVE: publish all not-yet-done
//   node --env-file=.env.local scripts/lrclib/publish.mjs --live --limit 5
//
// Resumable: writes scripts/lrclib/.progress.json (song id -> result). Re-runs skip
// anything already CREATED. Safe to stop and restart.

import { createClient } from "@supabase/supabase-js";
import { hash as cryptoHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROGRESS_PATH = join(HERE, ".progress.json");
const ARTIST = "Chad Lewine";
const CLIENT = "chadlewine-catalog-seed/1.0 (https://chadlewine.com)";
const DELAY_MS = 1500; // polite pacing between submissions

const args = process.argv.slice(2);
const LIVE = args.includes("--live") || args.includes("--song");
const SONG = (() => {
  const i = args.indexOf("--song");
  return i >= 0 ? args[i + 1] : null;
})();
const LIMIT = (() => {
  const i = args.indexOf("--limit");
  return i >= 0 ? parseInt(args[i + 1], 10) : Infinity;
})();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const loadProgress = () =>
  existsSync(PROGRESS_PATH) ? JSON.parse(readFileSync(PROGRESS_PATH, "utf8")) : {};
const saveProgress = (p) => writeFileSync(PROGRESS_PATH, JSON.stringify(p, null, 2));

// ---- Proof of work -------------------------------------------------------
function solveChallenge(prefix, targetHex) {
  const target = Buffer.from(targetHex, "hex");
  for (let nonce = 0; ; nonce++) {
    const h = cryptoHash("sha256", prefix + nonce, "buffer");
    let ok = true;
    for (let i = 0; i < target.length; i++) {
      if (h[i] > target[i]) { ok = false; break; }
      if (h[i] < target[i]) break; // strictly less -> valid
    }
    if (ok) return String(nonce);
  }
}

async function requestChallenge() {
  const res = await fetch("https://lrclib.net/api/request-challenge", { method: "POST" });
  if (!res.ok) throw new Error(`request-challenge ${res.status}`);
  return res.json(); // { prefix, target }
}

async function publishOne(song) {
  const { prefix, target } = await requestChallenge();
  const nonce = solveChallenge(prefix, target);
  const res = await fetch("https://lrclib.net/api/publish", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Publish-Token": `${prefix}:${nonce}`,
      "Lrclib-Client": CLIENT,
    },
    body: JSON.stringify({
      trackName: song.trackName,
      artistName: ARTIST,
      albumName: song.albumName,
      duration: song.duration,
      plainLyrics: song.plainLyrics,
      syncedLyrics: "",
    }),
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

// ---- Build submission set ------------------------------------------------
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } = await supabase
  .from("songs")
  .select(
    "id,title,slug,duration_seconds,instrumental,status,lyrics,release_songs(releases(title,release_date))"
  );
if (error) { console.error("Query failed:", error.message); process.exit(1); }

const primaryRelease = (s) => {
  const rels = (s.release_songs || [])
    .map((rs) => rs.releases)
    .filter(Boolean)
    .sort((a, b) => String(a.release_date || "").localeCompare(String(b.release_date || "")));
  return rels[0] || null;
};

// Exclude the Demoesque compilation and any "(Demo)" titles -- LRCLIB should
// mirror the released catalog only (matches the entity-catalog exclusions).
const isExcluded = (s) => {
  const album = (primaryRelease(s)?.title || "").toLowerCase();
  if (album === "demoesque") return true;
  if (/\(demo\)/i.test(s.title)) return true;
  return false;
};

let pool = data
  .filter((s) => s.status === "published" && !s.instrumental)
  .filter((s) => typeof s.lyrics === "string" && s.lyrics.trim().length > 0)
  .filter((s) => s.duration_seconds > 0)
  .filter((s) => primaryRelease(s))
  .filter((s) => !isExcluded(s))
  .map((s) => ({
    id: s.id,
    slug: s.slug,
    trackName: s.title,
    albumName: primaryRelease(s).title,
    duration: s.duration_seconds,
    plainLyrics: s.lyrics.trim(),
  }))
  .sort((a, b) => a.trackName.localeCompare(b.trackName));

if (SONG) pool = pool.filter((s) => s.slug === SONG);

const progress = loadProgress();
const todo = pool.filter((s) => progress[s.id]?.status !== 201).slice(0, LIMIT);

console.log(`Mode: ${LIVE ? "LIVE" : "DRY RUN"}${SONG ? ` (single: ${SONG})` : ""}`);
console.log(`Ready pool: ${pool.length} | already done: ${pool.length - pool.filter((s) => progress[s.id]?.status !== 201).length} | to submit now: ${todo.length}\n`);

if (!LIVE) {
  for (const s of todo) console.log(`  [would publish] ${s.trackName}  --  ${s.albumName} (${s.duration}s)`);
  console.log(`\nDry run only. Re-run with --song <slug> for a single live test, or --live for all.`);
  process.exit(0);
}

let created = 0, failed = 0;
for (const [idx, s] of todo.entries()) {
  process.stdout.write(`(${idx + 1}/${todo.length}) ${s.trackName} ... solving PoW ... `);
  try {
    const { status, body } = await publishOne(s);
    progress[s.id] = { status, slug: s.slug, title: s.trackName };
    saveProgress(progress);
    if (status === 201) { created++; console.log("CREATED"); }
    else { failed++; console.log(`HTTP ${status}: ${body.slice(0, 200)}`); }
  } catch (e) {
    failed++;
    progress[s.id] = { status: "error", slug: s.slug, title: s.trackName, error: String(e) };
    saveProgress(progress);
    console.log(`ERROR: ${e}`);
  }
  if (idx < todo.length - 1) await sleep(DELAY_MS);
}

console.log(`\nDone. created=${created} failed=${failed}. Progress: ${PROGRESS_PATH}`);
