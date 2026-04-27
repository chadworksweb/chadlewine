/**
 * prose-sections-build-export.ts
 *
 * Option C of audit Q2: Supabase is the source of truth for prose sections;
 * markdown files in /prose/sections/ are build-time export artifacts.
 *
 * Run as a prebuild step. Reads all published prose_sections from Supabase
 * and writes:
 *   - /prose/sections/[slug].md  (frontmatter + content)
 *   - /prose/sections/_order.json (slug + order_index manifest)
 *
 * Drafts are skipped — only published sections export. Re-runs are idempotent
 * (file overwrite).
 *
 * Usage:
 *   npx tsx scripts/prose-sections-build-export.ts
 *   npx tsx scripts/prose-sections-build-export.ts --dry-run
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const PROSE_DIR = path.resolve(__dirname, "../prose/sections");
const dryRun = process.argv.includes("--dry-run");

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
  });
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function frontmatter(s: any): string {
  const lines = [
    "---",
    `title: ${JSON.stringify(s.title)}`,
    `slug: ${s.slug}`,
    `order_index: ${s.order_index}`,
    `scope_kind: ${s.scope_kind}`,
  ];
  if (s.date_start) lines.push(`date_start: ${s.date_start}`);
  if (s.date_end) lines.push(`date_end: ${s.date_end}`);
  if (s.last_published_at) lines.push(`published_at: ${s.last_published_at}`);
  lines.push("---");
  return lines.join("\n") + "\n\n";
}

async function main() {
  const { data: sections, error } = await supabase
    .from("prose_sections")
    .select("id,slug,title,order_index,scope_kind,date_start,date_end,content_md,last_published_at")
    .eq("status", "published")
    .order("order_index");

  if (error) {
    console.error(`Query failed: ${error.message}`);
    process.exit(1);
  }

  if (!sections || sections.length === 0) {
    console.log(
      `${dryRun ? "[DRY-RUN] " : ""}No published prose sections to export. Skipping.`
    );
    return;
  }

  if (!dryRun && !fs.existsSync(PROSE_DIR)) {
    fs.mkdirSync(PROSE_DIR, { recursive: true });
  }

  for (const s of sections) {
    const filePath = path.join(PROSE_DIR, `${s.slug}.md`);
    const body = frontmatter(s) + (s.content_md ?? "") + "\n";
    if (dryRun) {
      console.log(`  [dry] ${s.slug} → ${filePath} (${body.length} bytes)`);
    } else {
      fs.writeFileSync(filePath, body, "utf-8");
      console.log(`  OK ${s.slug}`);
    }
  }

  const manifest = sections.map((s) => ({ slug: s.slug, order: s.order_index, title: s.title }));
  const manifestPath = path.join(PROSE_DIR, "_order.json");
  if (dryRun) {
    console.log(`  [dry] manifest → ${manifestPath} (${manifest.length} entries)`);
  } else {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
    console.log(`  Manifest → ${manifestPath}`);
  }

  console.log(`${dryRun ? "[DRY-RUN] " : ""}Exported ${sections.length} prose section(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
