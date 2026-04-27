/**
 * ingest-discography-release-eras.ts
 *
 * One-time + idempotent ingest of "Chad Lewine Discography.md" into:
 *   - eras (kind='release') — one row per real release header. Linked to
 *                              an existing albums row by fuzzy title match
 *                              when possible.
 *
 * Skips "(planned)" placeholders (no date, no album exists yet).
 * Re-runs upsert by slug.
 *
 * Usage:
 *   npx tsx scripts/ingest-discography-release-eras.ts --dry-run
 *   npx tsx scripts/ingest-discography-release-eras.ts
 *   npx tsx scripts/ingest-discography-release-eras.ts --source "/some/other.md"
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { remark } from "remark";
import remarkHtml from "remark-html";

const DEFAULT_SOURCE = path.resolve(
  "C:/Users/chad/Dropbox/Chad Lewine/plans and docs/Chad Lewine Discography.md"
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

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, sept: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, oct: 10, nov: 11, dec: 12,
};

function parseDate(token: string): string | null {
  // Examples seen: "March 12th, 2025", "Aug 23rd, 2021", "Sept 14th, 2018",
  //                "August 11th, 2019", "Feb 12th 2014"
  const m = token.match(/([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (!month) return null;
  const day = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseEraWindow(body: string): { start: string | null; end: string | null } {
  // Look for bold "**Era: Month Year - Month Year**" line in body
  const m = body.match(/\*\*Era:\s*([A-Za-z]+)\s+(\d{4})\s*[-–]\s*([A-Za-z]+)\s+(\d{4})/);
  if (!m) return { start: null, end: null };
  const startMonth = MONTHS[m[1].toLowerCase()];
  const endMonth = MONTHS[m[3].toLowerCase()];
  if (!startMonth || !endMonth) return { start: null, end: null };
  const start = `${m[2]}-${String(startMonth).padStart(2, "0")}-01`;
  // Approximate end-of-month
  const endDay = endMonth === 2 ? 28 : 30;
  const end = `${m[4]}-${String(endMonth).padStart(2, "0")}-${endDay}`;
  return { start, end };
}

type ParsedRelease = {
  title: string;
  rawHeading: string;
  releaseDate: string | null;
  eraStart: string | null;
  eraEnd: string | null;
  isPlanned: boolean;
  body: string;
};

const RELEASE_HEADING_RE = /^#\s+(.+?)\s*$/;

function parseReleases(content: string): ParsedRelease[] {
  const lines = content.split("\n");
  const releases: ParsedRelease[] = [];
  let current: ParsedRelease | null = null;
  const buffer: string[] = [];

  // Skip the document title "# Chad Lewine Discography"
  let seenFirstHeader = false;

  const flush = () => {
    if (current) {
      current.body = buffer.join("\n").trim();
      const { start, end } = parseEraWindow(current.body);
      current.eraStart = start ?? current.releaseDate;
      current.eraEnd = end;
      releases.push(current);
    }
  };

  for (const line of lines) {
    const m = line.match(RELEASE_HEADING_RE);
    if (m) {
      const heading = m[1];
      if (!seenFirstHeader && /chad lewine discography/i.test(heading)) {
        seenFirstHeader = true;
        continue;
      }
      flush();
      const isPlanned = /\(planned\)/i.test(heading) || /just an idea/i.test(heading);
      // Extract the LAST parenthetical (the date), not the first (which is
      // often a track-number prefix like (094)). Fallback: scan the whole
      // heading for a date pattern (some entries put the date outside parens).
      const allParens = [...heading.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]);
      let releaseDate: string | null = null;
      if (!isPlanned) {
        for (let i = allParens.length - 1; i >= 0 && !releaseDate; i--) {
          releaseDate = parseDate(allParens[i]);
        }
        if (!releaseDate) {
          releaseDate = parseDate(heading);
        }
      }
      // Strip the parenthetical and any track-id prefix like (094) or QZWFJ...
      const cleanTitle = heading
        .replace(/\(\d{3}\)\s*/, "")
        .replace(/\s+QZ[A-Z0-9]+\s*/g, " ")
        .replace(/\s*\([^)]*\)\s*$/, "")
        .replace(/^\d{3}[A-Z]?\s+/, "")
        .replace(/\\/g, "")
        .trim();
      current = {
        title: cleanTitle,
        rawHeading: line,
        releaseDate,
        eraStart: null,
        eraEnd: null,
        isPlanned,
        body: "",
      };
      buffer.length = 0;
    } else if (current) {
      buffer.push(line);
    }
  }
  flush();
  return releases;
}

async function findAlbumId(title: string): Promise<string | null> {
  // Try exact match first, then case-insensitive contains
  const { data: exact } = await supabase
    .from("albums")
    .select("id, title")
    .ilike("title", title)
    .limit(1)
    .maybeSingle();
  if (exact) return exact.id;

  const { data: fuzzy } = await supabase
    .from("albums")
    .select("id, title")
    .ilike("title", `%${title}%`)
    .limit(1);
  if (fuzzy && fuzzy.length > 0) return fuzzy[0].id;

  return null;
}

async function upsertReleaseEra(rel: ParsedRelease) {
  if (rel.isPlanned) {
    console.log(`  SKIP (planned): ${rel.title}`);
    return;
  }
  if (!rel.eraStart) {
    console.log(`  SKIP (no date): ${rel.title}`);
    return;
  }

  const slug = slugify(`release-${rel.title}`);
  const albumId = await findAlbumId(rel.title);
  const bodyHtml = await mdToHtml(rel.body);

  const row = {
    slug,
    title: rel.title,
    kind: "release",
    date_start: rel.eraStart,
    date_end: rel.eraEnd,
    album_id: albumId,
    body_md: rel.body,
    body_html: bodyHtml,
    status: "draft",
  };

  if (dryRun) {
    console.log(
      `  [dry] release_era: ${slug} (${rel.eraStart}..${rel.eraEnd ?? "—"}) album=${albumId ?? "(none)"}`
    );
    return;
  }

  const { error } = await supabase
    .from("eras")
    .upsert(row, { onConflict: "slug" });

  if (error) {
    console.error(`  ERROR ${slug}: ${error.message}`);
  } else {
    console.log(`  OK ${slug} ${albumId ? "→ album linked" : "(no album match)"}`);
  }
}

async function main() {
  if (!fs.existsSync(sourcePath)) {
    console.error(`Source not found: ${sourcePath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(sourcePath, "utf-8");
  const releases = parseReleases(content);

  console.log(
    `${dryRun ? "[DRY-RUN] " : ""}Parsed ${releases.length} release entries from ${path.basename(sourcePath)}`
  );

  for (const rel of releases) {
    await upsertReleaseEra(rel);
  }

  console.log(`\n${dryRun ? "[DRY-RUN] " : ""}Done.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
