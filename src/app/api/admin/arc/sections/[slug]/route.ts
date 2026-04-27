import { createAdminClient } from "@/lib/supabase-server";
import { markdownToHtml } from "@/lib/markdown";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { slug } = await ctx.params;
  const supabase = createAdminClient();

  const { data: section, error } = await supabase
    .from("prose_sections")
    .select("*")
    .eq("slug", slug)
    .single();
  if (error || !section) return Response.json({ error: "Not found" }, { status: 404 });

  const { data: deps } = await supabase
    .from("prose_section_dependencies")
    .select("entity_kind,entity_id,added_at")
    .eq("section_id", section.id)
    .order("added_at", { ascending: false });

  const { data: revisions } = await supabase
    .from("prose_section_revisions")
    .select("id,revision_number,created_at")
    .eq("section_id", section.id)
    .order("revision_number", { ascending: false });

  return Response.json({ section, dependencies: deps ?? [], revisions: revisions ?? [] });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { slug } = await ctx.params;
  const body = await request.json();
  const supabase = createAdminClient();

  const updates: Record<string, unknown> = {};
  if (typeof body.title === "string") updates.title = body.title;
  if (typeof body.content_md === "string") {
    updates.content_md = body.content_md;
    updates.content_html = await markdownToHtml(body.content_md);
  }
  if (typeof body.order_index === "number") updates.order_index = body.order_index;

  const { data, error } = await supabase
    .from("prose_sections")
    .update(updates)
    .eq("slug", slug)
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
