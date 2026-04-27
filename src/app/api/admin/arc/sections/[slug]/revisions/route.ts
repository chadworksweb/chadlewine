import { createAdminClient } from "@/lib/supabase-server";
import { markdownToHtml } from "@/lib/markdown";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { slug } = await ctx.params;
  const supabase = createAdminClient();
  const { data: section } = await supabase
    .from("prose_sections")
    .select("id")
    .eq("slug", slug)
    .single();
  if (!section) return Response.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("prose_section_revisions")
    .select("*")
    .eq("section_id", section.id)
    .order("revision_number", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

/**
 * Restore a revision as the current content.
 * Body: { revision_id }
 * Behavior: archives current content as a new revision, then sets the section
 * content to the chosen revision's content. Section returns to draft state
 * unless explicitly republished.
 */
export async function POST(request: Request, ctx: Ctx) {
  const { slug } = await ctx.params;
  const { revision_id } = await request.json();
  if (!revision_id) return Response.json({ error: "revision_id required" }, { status: 400 });

  const supabase = createAdminClient();

  const { data: section } = await supabase
    .from("prose_sections")
    .select("*")
    .eq("slug", slug)
    .single();
  if (!section) return Response.json({ error: "Not found" }, { status: 404 });

  const { data: revision } = await supabase
    .from("prose_section_revisions")
    .select("*")
    .eq("id", revision_id)
    .single();
  if (!revision) return Response.json({ error: "Revision not found" }, { status: 404 });

  // Archive current content as a new revision before overwriting.
  if (section.content_md) {
    const { data: lastRev } = await supabase
      .from("prose_section_revisions")
      .select("revision_number")
      .eq("section_id", section.id)
      .order("revision_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextRev = (lastRev?.revision_number ?? 0) + 1;
    await supabase.from("prose_section_revisions").insert({
      section_id: section.id,
      revision_number: nextRev,
      content_md: section.content_md,
      content_html: section.content_html ?? "",
    });
  }

  const restoredHtml = await markdownToHtml(revision.content_md);
  const { data: updated, error } = await supabase
    .from("prose_sections")
    .update({
      content_md: revision.content_md,
      content_html: restoredHtml,
      status: "draft",
    })
    .eq("id", section.id)
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ section: updated, restored_from: revision.revision_number });
}
