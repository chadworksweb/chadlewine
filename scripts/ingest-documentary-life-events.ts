/**
 * ingest-documentary-life-events.ts
 *
 * One-time + idempotent ingest of "Chad Lewine Documentary Script.md" into:
 *   - eras (kind='life')   — one row per top-level # section (year-range header)
 *   - life_events          — one row per paragraph inside each section,
 *                            source='documentary', linked to its era
 *
 * Verbatim fidelity: body_md is copied byte-for-byte from the source paragraph.
 * Re-runs upsert by slug; safe to invoke repeatedly.
 *
 * Usage:
 *   npx tsx scripts/ingest-documentary-life-events.ts --dry-run
 *   npx tsx scripts/ingest-documentary-life-events.ts
 *   npx tsx scripts/ingest-documentary-life-events.ts --source "/some/other/file.md"
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { remark } from "remark";
import remarkHtml from "remark-html";

const DEFAULT_SOURCE = path.resolve(
  "C:/Users/chad/Dropbox/Chad Lewine/plans and docs/Chad Lewine Documentary Script.md"
);

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

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function mdToHtml(md: string): Promise<string> {
  const file = await remark().use(remarkHtml).process(md);
  return String(file);
}

type ParsedEra = {
  title: string;
  rawHeading: string;
  dateStart: string;
  dateEnd: string | null;
  body: string;
};

// Parses headings like:
//   # Childhood (1989 \- 2004\)
//   # North Wales, Tom and Paul (2023 \- 2024\)
//   # Chad Rising (2024 \- present)
const HEADING_RE = /^#\s+(.+?)\s*\\?\((\d{4})\s*\\?[-–]\s*(\d{4}|present)\\?\)\s*$/;

function parseEras(content: string): ParsedEra[] {
  const lines = content.split("\n");
  const eras: ParsedEra[] = [];
  let current: ParsedEra | null = null;
  const buffer: string[] = [];

  const flush = () => {
    if (current) {
      current.body = buffer.join("\n").trim();
      eras.push(current);
    }
  };

  for (const line of lines) {
    const m = line.match(HEADING_RE);
    if (m) {
      flush();
      const [, rawTitle, yStart, yEnd] = m;
      const title = rawTitle.replace(/\\/g, "").trim();
      current = {
        title,
        rawHeading: line,
        dateStart: `${yStart}-01-01`,
        dateEnd: yEnd === "present" ? null : `${yEnd}-12-31`,
        body: "",
      };
      buffer.length = 0;
    } else if (current) {
      buffer.push(line);
    }
  }
  flush();
  return eras;
}

function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

async function upsertEra(era: ParsedEra): Promise<string | null> {
  const slug = slugify(era.title);
  const bodyHtml = await mdToHtml(era.body.slice(0, 2000));

  const row = {
    slug,
    title: era.title,
    kind: "life",
    date_start: era.dateStart,
    date_end: era.dateEnd,
    body_md: era.body,
    body_html: bodyHtml,
    status: "draft",
  };

  if (dryRun) {
    console.log(`  [dry] era: ${slug} (${era.dateStart}..${era.dateEnd ?? "present"})`);
    return null;
  }

  const { data, error } = await supabase
    .from("eras")
    .upsert(row, { onConflict: "slug" })
    .select("id")
    .single();

  if (error) {
    console.error(`  ERROR era ${slug}: ${error.message}`);
    return null;
  }
  return data.id;
}

async function upsertLifeEvent(
  eraSlug: string,
  eraId: string | null,
  eraDateStart: string,
  paragraph: string,
  index: number
) {
  const titleSeed = paragraph
    .replace(/\s+/g, " ")
    .slice(0, 60)
    .replace(/[*_`[\]()]/g, "");
  const slug = `${eraSlug}-doc-${String(index + 1).padStart(3, "0")}`;
  const title = `${titleSeed}${paragraph.length > 60 ? "…" : ""}`;
  const bodyHtml = await mdToHtml(paragraph);

  const row = {
    slug,
    title,
    date_start: eraDateStart,
    era_id: eraId,
    body_md: paragraph,
    body_html: bodyHtml,
    source: "documentary",
    status: "draft",
    display_order: index,
  };

  if (dryRun) {
    console.log(`    [dry] life_event: ${slug} (${title.slice(0, 40)}…)`);
    return;
  }

  const { error } = await supabase
    .from("life_events")
    .upsert(row, { onConflict: "slug" });

  if (error) {
    console.error(`    ERROR life_event ${slug}: ${error.message}`);
  }
}

async function main() {
  if (!fs.existsSync(sourcePath)) {
    console.error(`Source not found: ${sourcePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(sourcePath, "utf-8");
  const eras = parseEras(content);

  console.log(
    `${dryRun ? "[DRY-RUN] " : ""}Parsed ${eras.length} life-eras from ${path.basename(sourcePath)}`
  );

  let eraCount = 0;
  let eventCount = 0;

  for (const era of eras) {
    console.log(`\nEra: ${era.title}`);
    const eraId = await upsertEra(era);
    eraCount++;

    const paragraphs = splitParagraphs(era.body);
    let idx = 0;
    for (const p of paragraphs) {
      const eraSlug = slugify(era.title);
      await upsertLifeEvent(eraSlug, eraId, era.dateStart, p, idx);
      idx++;
      eventCount++;
    }
  }

  console.log(
    `\n${dryRun ? "[DRY-RUN] " : ""}Done: ${eraCount} eras, ${eventCount} life_events ${dryRun ? "would be" : ""} written.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
