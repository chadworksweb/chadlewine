import { markdownToHtml } from "@/lib/markdown";

/**
 * Single source of truth for converting raw visibility-section rows into
 * render-ready data. Anything markdown-bearing on a section is converted
 * to HTML here so consumers never have to think about it. New markdown
 * fields are added in this one place.
 *
 * The *Html naming on the output type makes the contract explicit: a
 * future code path that reads keyPointsHtml and tries to render it as
 * plain text is now obviously wrong, instead of silently leaking
 * "[Title](/url)" into the DOM.
 */

export interface RawVisibilitySection {
  id: string;
  category: string;
  content: string | null;
  direct_answer: string | null;
  key_points: string[] | null;
}

export interface RenderedSection {
  id: string;
  category: string;
  content: string;
  contentHtml: string;
  directAnswer: string | null;
  keyPointsHtml: string[];
}

/**
 * Inline-only markdown renderer. markdownToHtml wraps single-line input
 * in a <p>...</p>; for content that lands inside an <li>, we strip the
 * paragraph wrapper so the list item stays semantically clean.
 */
export async function markdownToInlineHtml(md: string): Promise<string> {
  const html = (await markdownToHtml(md)).trim();
  // Strip a single outer <p>...</p> wrapper if it's the only block. Multi-
  // paragraph input (rare in a key point) is returned as-is.
  const m = html.match(/^<p>([\s\S]*)<\/p>$/);
  if (m && !m[1].includes("<p>")) return m[1];
  return html;
}

export async function renderSection(s: RawVisibilitySection): Promise<RenderedSection> {
  return {
    id: s.id,
    category: s.category,
    content: s.content || "",
    contentHtml: s.content ? await markdownToHtml(s.content) : "",
    directAnswer: s.direct_answer || null,
    keyPointsHtml: await Promise.all((s.key_points || []).map(markdownToInlineHtml)),
  };
}

/**
 * Pull every /music/songs/{slug} reference out of a section's HTML.
 * Used by the song detail page to surface a song-art grid for the songs
 * a section mentions (e.g. the Connections section).
 */
export function extractSongSlugs(section: RenderedSection): string[] {
  const haystack = [section.contentHtml, ...section.keyPointsHtml].join(" ");
  const slugs = new Set<string>();
  // Match href="/music/songs/<slug>" — accepts trailing slash, query, or hash.
  const re = /href="\/music\/songs\/([a-z0-9-]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(haystack)) !== null) {
    slugs.add(m[1]);
  }
  return [...slugs];
}
