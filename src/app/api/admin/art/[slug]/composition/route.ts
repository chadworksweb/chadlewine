import { createAdminClient } from "@/lib/supabase-server";
import { markdownToHtml } from "@/lib/markdown";

type Ctx = { params: Promise<{ slug: string }> };

async function resolveArtId(supabase: ReturnType<typeof createAdminClient>, slug: string) {
  const { data, error } = await supabase.from("art_pieces").select("id").eq("slug", slug).single();
  if (error || !data) return null;
  return data.id as string;
}

export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const artId = await resolveArtId(supabase, slug);
  if (!artId) return Response.json({ error: "art piece not found" }, { status: 404 });

  const [compRes, revRes] = await Promise.all([
    supabase.from("art_composition").select("*").eq("art_id", artId).maybeSingle(),
    supabase
      .from("art_composition_revisions")
      .select("id, revision_number, content, content_html, created_at")
      .eq("art_id", artId)
      .order("revision_number", { ascending: false }),
  ]);

  return Response.json({
    composition: compRes.data || null,
    revisions: revRes.data || [],
  });
}

export async function PUT(request: Request, { params }: Ctx) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const artId = await resolveArtId(supabase, slug);
  if (!artId) return Response.json({ error: "art piece not found" }, { status: 404 });

  const body = await request.json();
  const content: string = typeof body.content === "string" ? body.content : "";
  const status: "draft" | "published" = body.status === "published" ? "published" : "draft";
  const contentHtml = content.trim() ? await markdownToHtml(content) : "";

  const { data: existing } = await supabase
    .from("art_composition")
    .select("id, content, content_html")
    .eq("art_id", artId)
    .maybeSingle();

  if (existing && existing.content && existing.content !== content) {
    const { data: latestRev } = await supabase
      .from("art_composition_revisions")
      .select("revision_number")
      .eq("art_id", artId)
      .order("revision_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextRev = (latestRev?.revision_number || 0) + 1;
    await supabase.from("art_composition_revisions").insert({
      art_id: artId,
      content: existing.content,
      content_html: existing.content_html,
      revision_number: nextRev,
    });
  }

  if (existing) {
    const { data, error } = await supabase
      .from("art_composition")
      .update({ content, content_html: contentHtml, status })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  }

  const { data, error } = await supabase
    .from("art_composition")
    .insert({ art_id: artId, content, content_html: contentHtml, status })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
