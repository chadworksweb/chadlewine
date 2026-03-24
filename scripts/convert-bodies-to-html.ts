/**
 * One-time migration: convert all observation bodies from markdown to HTML.
 * Run with: npx tsx scripts/convert-bodies-to-html.ts
 */
import { createClient } from "@supabase/supabase-js";
import { remark } from "remark";
import html from "remark-html";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing env vars. Run with: source .env.local && npx tsx scripts/convert-bodies-to-html.ts");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function unescapeShortcodes(md: string): string {
  return md.replace(/\\\[/g, "[").replace(/\\\]/g, "]");
}

function parseShortcodes(input: string): string {
  let result = input;

  result = result.replace(
    /\[aw_intro\]([\s\S]*?)\[\/aw_intro\]/g,
    '<div class="aw-intro">$1</div>'
  );

  result = result.replace(
    /\[aw_rubric\]([\s\S]*?)\[\/aw_rubric\]/g,
    (_match: string, content: string) => `<div class="aw-rubric">${content}</div>`
  );

  result = result.replace(
    /\[aw_year_grid\]([\s\S]*?)\[\/aw_year_grid\]/g,
    '<div class="aw-year-grid">$1</div>'
  );

  result = result.replace(
    /\[aw_year\]([\s\S]*?)\[\/aw_year\]/g,
    '<div class="aw-year">$1</div>'
  );

  result = result.replace(
    /\[aw_heading\]([\s\S]*?)\[\/aw_heading\]/g,
    '<h2 class="aw-section-heading">$1</h2>'
  );

  result = result.replace(
    /\[aw_card\s+color="([^"]*?)"\]([\s\S]*?)\[\/aw_card\]/g,
    '<div class="aw-card aw-card--$1">$2</div>'
  );

  result = result.replace(
    /\[aw_contrast\s+title_left="([^"]*?)"\s+title_right="([^"]*?)"\]([\s\S]*?)\[\/aw_contrast\]/g,
    (_match: string, titleLeft: string, titleRight: string, content: string) => {
      const items: { side: string; content: string }[] = [];
      const itemRegex = /\[aw_contrast_item\s+side="(left|right)"\]([\s\S]*?)\[\/aw_contrast_item\]/g;
      let itemMatch;
      while ((itemMatch = itemRegex.exec(content)) !== null) {
        items.push({ side: itemMatch[1], content: itemMatch[2] });
      }
      const lefts = items.filter((i) => i.side === "left");
      const rights = items.filter((i) => i.side === "right");
      const rows = lefts.map((l, i) => {
        const r = rights[i];
        return `<div class="aw-contrast__row"><div class="aw-contrast__cell aw-contrast__cell--left">${l.content}</div><div class="aw-contrast__cell aw-contrast__cell--right">${r ? r.content : ""}</div></div>`;
      }).join("");
      return `<div class="aw-contrast"><div class="aw-contrast__header"><div class="aw-contrast__col-title">${titleLeft}</div><div class="aw-contrast__col-title">${titleRight}</div></div>${rows}</div>`;
    }
  );

  result = result.replace(
    /\[aw_track_table\]([\s\S]*?)\[\/aw_track_table\]/g,
    (_match: string, content: string) => {
      const tracks: string[] = [];
      const trackRegex = /\[aw_track\s+num="([^"]*?)"\s+name="([^"]*?)"\s+charge="([^"]*?)"\]([\s\S]*?)\[\/aw_track\]/g;
      let trackMatch;
      while ((trackMatch = trackRegex.exec(content)) !== null) {
        const [, num, name, charge, assessment] = trackMatch;
        tracks.push(
          `<div class="aw-track-table__row aw-track-table__row--${charge}">` +
          `<span class="aw-track-table__cell aw-track-table__num">${num}</span>` +
          `<span class="aw-track-table__cell aw-track-table__name">${name}</span>` +
          `<span class="aw-track-table__cell aw-track-table__charge"><span class="aw-charge-dot aw-charge-dot--${charge}"></span></span>` +
          `<span class="aw-track-table__cell aw-track-table__assessment">${assessment.trim()}</span>` +
          `</div>`
        );
      }
      return `<div class="aw-track-table"><div class="aw-track-table__header"><span class="aw-track-table__hcell">#</span><span class="aw-track-table__hcell">Track</span><span class="aw-track-table__hcell">Charge</span><span class="aw-track-table__hcell">Assessment</span></div>${tracks.join("")}</div>`;
    }
  );

  result = result.replace(
    /\[aw_stats\]([\s\S]*?)\[\/aw_stats\]/g,
    (_match: string, content: string) => {
      const stats: string[] = [];
      const statRegex = /\[aw_stat\s+value="([^"]*?)"\s+label="([^"]*?)"(?:\s+detail="([^"]*?)")?(?:\s+color="([^"]*?)")?\s*\]/g;
      let statMatch;
      while ((statMatch = statRegex.exec(content)) !== null) {
        const [, value, label, detail, color] = statMatch;
        const colorClass = color ? ` aw-stats__card--${color}` : "";
        const valueColor = color ? ` aw-stats__value--${color}` : "";
        stats.push(
          `<div class="aw-stats__card${colorClass}">` +
          `<span class="aw-stats__value${valueColor}">${value}</span>` +
          `<span class="aw-stats__label">${label}</span>` +
          (detail ? `<span class="aw-stats__detail">${detail}</span>` : "") +
          `</div>`
        );
      }
      const cols = stats.length;
      return `<div class="aw-stats" style="grid-template-columns:repeat(${cols},1fr)">${stats.join("")}</div>`;
    }
  );

  return result;
}

async function markdownToHtml(markdown: string): Promise<string> {
  const unescaped = unescapeShortcodes(markdown);
  const withParagraphs = unescaped
    .replace(/\u00a0\s*\n/g, "\n\n")
    .replace(/\u00a0{2,}/g, "\n\n")
    .replace(/\u00a0\s+/g, "\n\n")
    .replace(/\s{2,}\n/g, "\n\n")
    .replace(/ \*(\s*$|\s*\r?\n)/gm, "*$1")
    .replace(/ \*\*(\s*$|\s*\r?\n)/gm, "**$1")
    .replace(/^\s*\t- /gm, "- ")
    .replace(/chadrising\.com/g, "chadlewine.com");
  const result = await remark().use(html, { sanitize: false }).process(withParagraphs);
  const parsed = parseShortcodes(result.toString());
  return parsed;
}

async function main() {
  const { data: observations, error } = await supabase
    .from("observations")
    .select("id, title, body")
    .order("date_captured", { ascending: true });

  if (error) {
    console.error("Failed to fetch observations:", error.message);
    process.exit(1);
  }

  console.log(`Converting ${observations.length} observations from markdown to HTML...\n`);

  let converted = 0;
  let skipped = 0;

  for (const obs of observations) {
    // Skip if body already looks like HTML
    if (obs.body.trim().startsWith("<")) {
      console.log(`  SKIP: "${obs.title}" — already HTML`);
      skipped++;
      continue;
    }

    const htmlBody = await markdownToHtml(obs.body);

    const { error: updateError } = await supabase
      .from("observations")
      .update({ body: htmlBody })
      .eq("id", obs.id);

    if (updateError) {
      console.error(`  FAIL: "${obs.title}" — ${updateError.message}`);
    } else {
      console.log(`  OK: "${obs.title}"`);
      converted++;
    }
  }

  console.log(`\nDone. Converted: ${converted}, Skipped: ${skipped}, Total: ${observations.length}`);
}

main();
