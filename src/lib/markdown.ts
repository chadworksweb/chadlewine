import { remark } from "remark";
import html from "remark-html";

/**
 * Unescape WordPress shortcodes that were escaped during migration.
 */
function unescapeShortcodes(md: string): string {
  return md.replace(/\\\[/g, "[").replace(/\\\]/g, "]");
}

/**
 * Parse WordPress shortcodes into HTML.
 * Matches the Chad Rising artist-world theme output structure.
 */
function parseShortcodes(input: string): string {
  let result = input;

  // aw_intro
  result = result.replace(
    /\[aw_intro\]([\s\S]*?)\[\/aw_intro\]/g,
    '<div class="aw-intro">$1</div>'
  );

  // aw_rubric — renders the default legend
  result = result.replace(
    /\[aw_rubric\]([\s\S]*?)\[\/aw_rubric\]/g,
    (_match, content) => {
      return `<div class="aw-rubric">${content}</div>`;
    }
  );

  // aw_year_grid
  result = result.replace(
    /\[aw_year_grid\]([\s\S]*?)\[\/aw_year_grid\]/g,
    '<div class="aw-year-grid">$1</div>'
  );

  // aw_year
  result = result.replace(
    /\[aw_year\]([\s\S]*?)\[\/aw_year\]/g,
    '<div class="aw-year">$1</div>'
  );

  // aw_heading
  result = result.replace(
    /\[aw_heading\]([\s\S]*?)\[\/aw_heading\]/g,
    '<h2 class="aw-section-heading">$1</h2>'
  );

  // aw_card
  result = result.replace(
    /\[aw_card\s+color="([^"]*?)"\]([\s\S]*?)\[\/aw_card\]/g,
    '<div class="aw-card aw-card--$1">$2</div>'
  );

  // aw_contrast — collect items, pair left/right into rows
  result = result.replace(
    /\[aw_contrast\s+title_left="([^"]*?)"\s+title_right="([^"]*?)"\]([\s\S]*?)\[\/aw_contrast\]/g,
    (_match, titleLeft, titleRight, content) => {
      // Parse contrast items
      const items: { side: string; content: string }[] = [];
      const itemRegex = /\[aw_contrast_item\s+side="(left|right)"\]([\s\S]*?)\[\/aw_contrast_item\]/g;
      let itemMatch;
      while ((itemMatch = itemRegex.exec(content)) !== null) {
        items.push({ side: itemMatch[1], content: itemMatch[2] });
      }

      // Pair left/right
      const lefts = items.filter((i) => i.side === "left");
      const rights = items.filter((i) => i.side === "right");
      const rows = lefts.map((l, i) => {
        const r = rights[i];
        return `<div class="aw-contrast__row"><div class="aw-contrast__cell aw-contrast__cell--left">${l.content}</div><div class="aw-contrast__cell aw-contrast__cell--right">${r ? r.content : ""}</div></div>`;
      }).join("");

      return `<div class="aw-contrast"><div class="aw-contrast__header"><div class="aw-contrast__col-title">${titleLeft}</div><div class="aw-contrast__col-title">${titleRight}</div></div>${rows}</div>`;
    }
  );

  // aw_track_table + aw_track — collect tracks into table rows
  result = result.replace(
    /\[aw_track_table\]([\s\S]*?)\[\/aw_track_table\]/g,
    (_match, content) => {
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

  // aw_stats + aw_stat — collect stats into grid
  result = result.replace(
    /\[aw_stats\]([\s\S]*?)\[\/aw_stats\]/g,
    (_match, content) => {
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

export async function markdownToHtml(markdown: string): Promise<string> {
  const unescaped = unescapeShortcodes(markdown);
  // Fix WordPress migration: NBSP (\u00a0) used as paragraph separators → convert to double newlines
  const withParagraphs = unescaped
    .replace(/\u00a0\s*\n/g, "\n\n")     // NBSP before newline → paragraph break
    .replace(/\u00a0{2,}/g, "\n\n")       // Multiple NBSP → paragraph break
    .replace(/\u00a0\s+/g, "\n\n")        // NBSP + whitespace → paragraph break
    .replace(/\s{2,}\n/g, "\n\n")         // Trailing spaces before newline → paragraph break
    // Fix italic/bold with trailing space before closing marker (valid in WP, invalid in markdown)
    .replace(/ \*(\s*$|\s*\r?\n)/gm, "*$1")            // trailing " *" at end of line → "*"
    .replace(/ \*\*(\s*$|\s*\r?\n)/gm, "**$1")         // trailing " **" at end of line → "**"
    // Fix lists: strip leading tabs before list markers
    .replace(/^\s*\t- /gm, "- ")
    // Swap chadrising.com URLs to chadlewine.com
    .replace(/chadrising\.com/g, "chadlewine.com");
  const result = await remark().use(html, { sanitize: false }).process(withParagraphs);
  const parsed = parseShortcodes(result.toString());
  return parsed;
}
