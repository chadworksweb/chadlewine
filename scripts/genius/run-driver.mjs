// Build a localStorage-seed file for the Genius submit driver.
//
// Usage:
//   node scripts/genius/run-driver.mjs "The Human Link" --skip "1 Dance"
//
// Reads packets.json, filters to one album, drops any --skip titles (and the
// globally-excluded "35", which already exists on Genius), and writes
// scripts/genius/.run/seed.js -- a browser_run_code function that loads the
// queue into the page's localStorage. The companion fill-next.js (static)
// processes the queue one song per invocation.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUN_DIR = join(HERE, ".run");
const packets = JSON.parse(readFileSync(join(HERE, "packets", "packets.json"), "utf8"));

const args = process.argv.slice(2);
const album = args.find((a) => !a.startsWith("--"));
const skip = (() => {
  const i = args.indexOf("--skip");
  return i >= 0 ? args[i + 1].split("||").map((s) => s.trim()) : [];
})();
const GLOBAL_SKIP = new Set(["35", ...skip]);

if (!album) { console.error('Pass an album name, e.g. "The Human Link"'); process.exit(1); }

const queue = packets
  .filter((s) => s.album === album)
  .filter((s) => !GLOBAL_SKIP.has(s.title))
  .sort((a, b) => a.n.localeCompare(b.n));

if (!queue.length) { console.error(`No queue songs for album "${album}" (after skips).`); process.exit(1); }

if (!existsSync(RUN_DIR)) mkdirSync(RUN_DIR, { recursive: true });

const seed =
  `async (page) => {\n` +
  `  const q = ${JSON.stringify(queue)};\n` +
  `  await page.evaluate((data) => {\n` +
  `    localStorage.setItem('clQueue', JSON.stringify(data));\n` +
  `    localStorage.setItem('clCursor', '0');\n` +
  `    localStorage.removeItem('clResults');\n` +
  `  }, q);\n` +
  `  return { album: ${JSON.stringify(album)}, seeded: q.length, titles: q.map((s) => s.title) };\n` +
  `}\n`;
writeFileSync(join(RUN_DIR, "seed.js"), seed);

console.log(`Seeded ${queue.length} songs for "${album}":`);
for (const s of queue) console.log(`  ${s.n} ${s.title}  [prod: ${s.producers.join(", ") || "none"}]`);
console.log(`\nWrote ${join(RUN_DIR, "seed.js")}`);
