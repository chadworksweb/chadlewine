import { createAdminClient } from "@/lib/supabase-server";
import { markdownToHtml } from "@/lib/markdown";

type Ctx = { params: Promise<{ slug: string }> };

/**
 * Publish a prose section.
 *   - Rerenders content_html from content_md
 *   - Status -> 'published'
 *   - Appends a revision row (revision_number = last + 1)
 *   - Clears is_stale and stale_reasons
 *   - Stamps last_published_at
 *
 * The repo-side markdown export (/prose/sections/[slug].md) is regenerated
 * at build time by scripts/prose-sections-build-export.ts (Step 7).
 * Runtime ProseReader serves from Supabase content_html with revalidate.
 */
export async function POST(_req: Request, ctx: Ctx) {
  const { slug } = await ctx.params;
  const supabase = createAdminClient();

  const { data: section, error } = await supabase
    .from("prose_sections")
    .select("id,content_md")
    .eq("slug", slug)
    .single();
  if (error || !section) return Response.json({ error: "Not found" }, { status: 404 });

  const html = await markdownToHtml(section.content_md ?? "");

  const { data: lastRev } = await supabase
    .from("prose_section_revisions")
    .select("revision_number")
    .eq("section_id", section.id)
    .order("revision_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextRev = (lastRev?.revision_number ?? 0) + 1;

  const { error: revErr } = await supabase.from("prose_section_revisions").insert({
    section_id: section.id,
    revision_number: nextRev,
    content_md: section.content_md ?? "",
    content_html: html,
  });
  if (revErr) return Response.json({ error: revErr.message }, { status: 500 });

  const { data: updated, error: updErr } = await supabase
    .from("prose_sections")
    .update({
      status: "published",
      content_html: html,
      is_stale: false,
      stale_reasons: [],
      last_published_at: new Date().toISOString(),
    })
    .eq("id", section.id)
    .select()
    .single();
  if (updErr) return Response.json({ error: updErr.message }, { status: 500 });

  return Response.json({ section: updated, revision_number: nextRev });
}
