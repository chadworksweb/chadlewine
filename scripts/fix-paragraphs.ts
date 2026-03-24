/**
 * fix-paragraphs.ts
 * Re-parses the original WordPress XML exports and updates observation bodies
 * in Supabase with properly paragraphed markdown.
 *
 * Usage: npx tsx scripts/fix-paragraphs.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Load env
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const [key, ...valueParts] = line.split("=");
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join("=").trim();
    }
  });
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Convert WordPress HTML content to clean markdown with proper paragraphs.
 * This replaces Turndown — we handle the conversion ourselves to preserve structure.
 */
function wpHtmlToMarkdown(html: string): string {
  let md = html;

  // Remove Fusion Builder shortcodes
  md = md.replace(/\[fusion_[^\]]*\]/g, "");
  md = md.replace(/\[\/fusion_[^\]]*\]/g, "");

  // Preserve AW shortcodes (don't strip them)
  // They'll be escaped later for markdown safety, then unescaped at render time

  // Convert block elements to markdown
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n\n## $1\n\n");
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n\n### $1\n\n");
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "\n\n#### $1\n\n");

  // Convert paragraphs — THIS is the key fix
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n\n$1\n\n");

  // Convert inline elements
  md = md.replace(/<strong>([\s\S]*?)<\/strong>/gi, "**$1**");
  md = md.replace(/<b>([\s\S]*?)<\/b>/gi, "**$1**");
  md = md.replace(/<em>([\s\S]*?)<\/em>/gi, "*$1*");
  md = md.replace(/<i>([\s\S]*?)<\/i>/gi, "*$1*");
  md = md.replace(/<u>([\s\S]*?)<\/u>/gi, "$1");
  md = md.replace(/<s>([\s\S]*?)<\/s>/gi, "~~$1~~");
  md = md.replace(/<strike>([\s\S]*?)<\/strike>/gi, "~~$1~~");

  // Convert links
  md = md.replace(/<a\s+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");

  // Convert line breaks
  md = md.replace(/<br\s*\/?>/gi, "\n");

  // Convert lists
  md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, "\n\n$1\n\n");
  md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, "\n\n$1\n\n");
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");

  // Convert blockquotes
  md = md.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, (_m, content) => {
    return "\n\n" + content.trim().split("\n").map((l: string) => "> " + l).join("\n") + "\n\n";
  });

  // Convert hr
  md = md.replace(/<hr\s*\/?>/gi, "\n\n---\n\n");

  // Strip remaining HTML tags (images with dead URLs, spans, divs, etc.)
  md = md.replace(/<img[^>]*src="[^"]*wp-content[^"]*"[^>]*>/gi, ""); // Remove WP-relative images
  md = md.replace(/<\/?span[^>]*>/gi, "");
  md = md.replace(/<\/?div[^>]*>/gi, "");

  // Decode HTML entities
  md = md.replace(/&amp;/g, "&");
  md = md.replace(/&lt;/g, "<");
  md = md.replace(/&gt;/g, ">");
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#039;/g, "'");
  md = md.replace(/&nbsp;/g, " ");
  md = md.replace(/&#8216;/g, "\u2018");
  md = md.replace(/&#8217;/g, "\u2019");
  md = md.replace(/&#8220;/g, "\u201C");
  md = md.replace(/&#8221;/g, "\u201D");
  md = md.replace(/&#8211;/g, "\u2013");
  md = md.replace(/&#8212;/g, "\u2014");

  // Clean up whitespace
  md = md.replace(/\n{3,}/g, "\n\n"); // Max 2 newlines
  md = md.replace(/^\s+|\s+$/g, ""); // Trim

  return md;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/&#0?39;/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

interface WPPost {
  title: string;
  slug: string;
  content: string;
  date: string;
  status: string;
}

function parseWPXml(xmlPath: string): WPPost[] {
  if (!fs.existsSync(xmlPath)) {
    console.log(`XML not found: ${xmlPath}`);
    return [];
  }

  const xml = fs.readFileSync(xmlPath, "utf-8");
  const posts: WPPost[] = [];

  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];

    const typeMatch = item.match(/<wp:post_type><!\[CDATA\[(.*?)\]\]><\/wp:post_type>/);
    if (!typeMatch || typeMatch[1] !== "post") continue;

    const titleMatch = item.match(/<title>(.*?)<\/title>/);
    const contentMatch = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);
    const dateMatch = item.match(/<wp:post_date><!\[CDATA\[(.*?)\]\]><\/wp:post_date>/);
    const statusMatch = item.match(/<wp:status><!\[CDATA\[(.*?)\]\]><\/wp:status>/);
    const slugMatch = item.match(/<wp:post_name><!\[CDATA\[(.*?)\]\]><\/wp:post_name>/);

    if (!titleMatch || !contentMatch) continue;

    const title = titleMatch[1];
    const content = contentMatch[1];
    const date = dateMatch ? dateMatch[1] : "";
    const status = statusMatch ? statusMatch[1] : "draft";
    const rawSlug = slugMatch ? slugMatch[1] : "";
    const slug = rawSlug ? decodeURIComponent(rawSlug) : slugify(title);

    // Skip very short content
    if (content.length < 50) continue;

    posts.push({ title, slug, content, date, status });
  }

  return posts;
}

async function main() {
  // Parse Chad Rising XML
  const xmlPath = "C:/Users/chad/Downloads/chadrisingworld.WordPress.2026-03-21.xml";
  const posts = parseWPXml(xmlPath);
  console.log(`Found ${posts.length} posts in Chad Rising XML`);

  let updated = 0;
  let notFound = 0;

  for (const post of posts) {
    const markdown = wpHtmlToMarkdown(post.content);
    const slug = slugify(post.title);

    // Try to match by slug
    const { data: existing } = await supabase
      .from("observations")
      .select("id, slug")
      .eq("source", "chad-rising")
      .or(`slug.eq.${slug},slug.eq.${post.slug}`)
      .limit(1);

    if (!existing || existing.length === 0) {
      // Try fuzzy match by title
      const { data: byTitle } = await supabase
        .from("observations")
        .select("id, slug, title")
        .eq("source", "chad-rising")
        .ilike("title", `%${post.title.substring(0, 30)}%`)
        .limit(1);

      if (!byTitle || byTitle.length === 0) {
        console.log(`NOT FOUND: ${post.title}`);
        notFound++;
        continue;
      }

      const { error } = await supabase
        .from("observations")
        .update({ body: markdown })
        .eq("id", byTitle[0].id);

      if (error) {
        console.log(`ERROR updating ${post.title}: ${error.message}`);
      } else {
        console.log(`UPDATED (by title): ${post.title}`);
        updated++;
      }
    } else {
      const { error } = await supabase
        .from("observations")
        .update({ body: markdown })
        .eq("id", existing[0].id);

      if (error) {
        console.log(`ERROR updating ${post.title}: ${error.message}`);
      } else {
        console.log(`UPDATED: ${post.title}`);
        updated++;
      }
    }
  }

  // Also fix pre-2023 posts from the SQL dump
  // These need NBSP cleanup since they came from a different migration path
  console.log("\n=== Fixing pre-2023 posts (NBSP cleanup) ===");
  const { data: pre2023 } = await supabase
    .from("observations")
    .select("id, title, body")
    .eq("source", "chadlewine-pre2023");

  if (pre2023) {
    for (const post of pre2023) {
      const fixed = post.body
        .replace(/\u00a0\s*\n/g, "\n\n")
        .replace(/\u00a0{2,}/g, "\n\n")
        .replace(/\u00a0\s+/g, "\n\n")
        .replace(/\s{2,}\n/g, "\n\n");

      const { error } = await supabase
        .from("observations")
        .update({ body: fixed })
        .eq("id", post.id);

      if (error) {
        console.log(`ERROR: ${post.title} — ${error.message}`);
      } else {
        console.log(`FIXED: ${post.title}`);
      }
    }
  }

  console.log(`\nDone. Updated: ${updated}, Not found: ${notFound}`);
}

main().catch(console.error);
