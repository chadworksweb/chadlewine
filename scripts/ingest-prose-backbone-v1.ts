/**
 * ingest-prose-backbone-v1.ts
 *
 * Reads "chad-lewine-arc-prose-backbone.md" and ingests its 14 sections into:
 *   - prose_sections           — one row per ## header (slug from locked list)
 *   - /prose/sections/[slug].md — a markdown file per section, written to
 *                                  the repo. Uncommitted (Chad reviews +
 *                                  commits the first batch manually).
 *
 * Idempotent: upsert by slug.
 *
 * Per the build prompt, scope-kind assignment:
 *   thematic: through-line, the-figure, through-line-consolidated,
 *             standout-lines, what-the-data-says
 *   date-range: every other section, with date_start/date_end set
 *
 * Usage:
 *   npx tsx scripts/ingest-prose-backbone-v1.ts --dry-run
 *   npx tsx scripts/ingest-prose-backbone-v1.ts
 *   npx tsx scripts/ingest-prose-backbone-v1.ts --source "/some/other.md"
 *
 * After running:
 *   git add prose/sections
 *   git status   # review what was written
 *   git commit -m "Initial prose backbone v1 ingest"
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { remark } from "remark";
import remarkHtml from "remark-html";

const DEFAULT_SOURCE = path.resolve(
  "C:/Users/chad/Dropbox/Chad Lewine/chad-lewine-arc-prose-backbone.md"
);
const PROSE_DIR = path.resolve(__dirname, "../prose/sections");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const sourceIdx = args.indexOf("--source");
const sourcePath = sourceIdx >= 0 ? args[sourceIdx + 1] : DEFAULT_SOURCE;

const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
    const [key, ...rest] = line.split("=");
    if (key && rest.length) process.env[key.trim()] = rest.join("=").trim();
  });
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Locked slug + scope mapping per build prompt §6.1.
type ScopeMap = {
  scope_kind: "era" | "date-range" | "thematic";
  date_start?: string | null;
  date_end?: string | null;
};

const HEADER_TO_SLUG: Record<string, string> = {
  "the through-line": "through-line",
  "the figure": "the-figure",
  "pre-catalog: 1989-2009": "pre-catalog-1989-2009",
  "pittsburgh / chad d: 2009-2010": "pittsburgh-chad-d-2009-2010",
  "brooklyn i: 2011-2013": "brooklyn-i-2011-2013",
  "brooklyn ii: 2013-2016": "brooklyn-ii-2013-2016",
  "brooklyn iii: 2016-2019": "brooklyn-iii-2016-2019",
  "the gap: 2019-2022": "the-gap-2019-2022",
  "tom and the rebrand: 2022-2024": "tom-and-the-rebrand-2022-2024",
  "hyperising era and the bullying": "hyperising-era-2025",
  "the don't blame me era": "dont-blame-me-era-2025-present",
  "what the data says about the figure": "what-the-data-says",
  "the through-line, consolidated": "through-line-consolidated",
  "the standout lines": "standout-lines",
};

const SCOPE: Record<string, ScopeMap> = {
  "through-line": { scope_kind: "thematic" },
  "the-figure": { scope_kind: "thematic" },
  "through-line-consolidated": { scope_kind: "thematic" },
  "standout-lines": { scope_kind: "thematic" },
  "what-the-data-says": { scope_kind: "thematic" },
  "pre-catalog-1989-2009": { scope_kind: "date-range", date_start: "1989-01-01", date_end: "2009-12-31" },
  "pittsburgh-chad-d-2009-2010": { scope_kind: "date-range", date_start: "2009-01-01", date_end: "2010-12-31" },
  "brooklyn-i-2011-2013": { scope_kind: "date-range", date_start: "2011-01-01", date_end: "2013-12-31" },
  "brooklyn-ii-2013-2016": { scope_kind: "date-range", date_start: "2013-01-01", date_end: "2016-12-31" },
  "brooklyn-iii-2016-2019": { scope_kind: "date-range", date_start: "2016-01-01", date_end: "2019-12-31" },
  "the-gap-2019-2022": { scope_kind: "date-range", date_start: "2019-01-01", date_end: "2022-12-31" },
  "tom-and-the-rebrand-2022-2024": { scope_kind: "date-range", date_start: "2022-01-01", date_end: "2024-12-31" },
  "hyperising-era-2025": { scope_kind: "date-range", date_start: "2025-03-01", date_end: "2025-09-30" },
  "dont-blame-me-era-2025-present": { scope_kind: "date-range", date_start: "2025-10-01", date_end: null },
};

function normalizeHeading(h: string): string {
  return h
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[*_`]/g, "")
    .trim();
}

function findSlug(rawHeading: string): string | null {
  const norm = normalizeHeading(rawHeading);
  // Sort keys longest-first so "the through-line, consolidated" matches its
  // own key before falling back to the shorter "the through-line".
  const keys = Object.keys(HEADER_TO_SLUG).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (norm.startsWith(key)) return HEADER_TO_SLUG[key];
  }
  return null;
}

async function mdToHtml(md: string): Promise<string> {
  const file = await remark().use(remarkHtml).process(md);
  return String(file);
}

type ParsedSection = {
  rawHeading: string;
  title: string;
  body: string;
};

function parseSections(content: string): ParsedSection[] {
  const lines = content.split("\n");
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;
  const buffer: string[] = [];

  const flush = () => {
    if (current) {
      current.body = buffer.join("\n").trim();
      sections.push(current);
    }
  };

  for (const line of lines) {
    const m = line.match(/^##\s+(.+)$/);
    if (m) {
      flush();
      const title = m[1].trim();
      current = { rawHeading: line, title, body: "" };
      buffer.length = 0;
    } else if (current) {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

function frontmatter(slug: string, title: string, scope: ScopeMap, order: number): string {
  const lines = [
    "---",
    `title: ${JSON.stringify(title)}`,
    `slug: ${slug}`,
    `order_index: ${order}`,
    `scope_kind: ${scope.scope_kind}`,
  ];
  if (scope.date_start) lines.push(`date_start: ${scope.date_start}`);
  if (scope.date_end) lines.push(`date_end: ${scope.date_end}`);
  lines.push(`published_at: ${new Date().toISOString()}`);
  lines.push("---");
  return lines.join("\n") + "\n\n";
}

async function main() {
  if (!fs.existsSync(sourcePath)) {
    console.error(`Source not found: ${sourcePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(sourcePath, "utf-8");
  const sections = parseSections(content);

  console.log(
    `${dryRun ? "[DRY-RUN] " : ""}Parsed ${sections.length} ## sections from ${path.basename(sourcePath)}`
  );

  if (!dryRun && !fs.existsSync(PROSE_DIR)) {
    fs.mkdirSync(PROSE_DIR, { recursive: true });
  }

  let order = 0;
  let written = 0;
  let skipped = 0;

  for (const sec of sections) {
    const slug = findSlug(sec.title);
    if (!slug) {
      console.log(`  SKIP (not in locked list): "${sec.title}"`);
      skipped++;
      continue;
    }
    const scope = SCOPE[slug];
    const html = await mdToHtml(sec.body);
    const fm = frontmatter(slug, sec.title, scope, order);
    const fileBody = fm + sec.body + "\n";

    const row = {
      slug,
      title: sec.title,
      order_index: order,
      scope_kind: scope.scope_kind,
      date_start: scope.date_start ?? null,
      date_end: scope.date_end ?? null,
      content_md: sec.body,
      content_html: html,
      status: "draft",
      is_stale: false,
      stale_reasons: [],
    };

    if (dryRun) {
      console.log(`  [dry] section ${order}: ${slug} (${scope.scope_kind})`);
    } else {
      const filePath = path.join(PROSE_DIR, `${slug}.md`);
      fs.writeFileSync(filePath, fileBody, "utf-8");
      const { error } = await supabase
        .from("prose_sections")
        .upsert(row, { onConflict: "slug" });
      if (error) {
        console.error(`  ERROR upsert ${slug}: ${error.message}`);
      } else {
        console.log(`  OK ${slug} → ${filePath}`);
      }
    }

    order++;
    written++;
  }

  // Write a manifest so ProseReader can resolve order at build time
  // without a DB query.
  if (!dryRun) {
    const manifest = sections
      .map((s) => findSlug(s.title))
      .filter((s): s is string => !!s)
      .map((slug, i) => ({ slug, order: i }));
    const manifestPath = path.join(PROSE_DIR, "_order.json");
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
    console.log(`\nManifest written → ${manifestPath}`);
  }

  console.log(
    `\n${dryRun ? "[DRY-RUN] " : ""}Done: ${written} sections ${dryRun ? "would be" : ""} written, ${skipped} skipped.`
  );
  if (!dryRun) {
    console.log(`\nReview the files under prose/sections/ then:`);
    console.log(`  git add prose/sections`);
    console.log(`  git commit -m "Initial prose backbone v1 ingest"`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
