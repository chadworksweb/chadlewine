import { createAdminClient } from "@/lib/supabase-server";

type Ctx = { params: Promise<{ slug: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const { data: art } = await supabase.from("art_pieces").select("id").eq("slug", slug).single();
  if (!art) return Response.json({ error: "art piece not found" }, { status: 404 });

  const body = await request.json();
  const revisionId: string | undefined = body.revision_id;
  if (!revisionId) return Response.json({ error: "revision_id required" }, { status: 400 });

  const { data: revision } = await supabase
    .from("art_composition_revisions")
    .select("content, content_html")
    .eq("id", revisionId)
    .eq("art_id", art.id)
    .single();
  if (!revision) return Response.json({ error: "revision not found" }, { status: 404 });

  const { data: existing } = await supabase
    .from("art_composition")
    .select("id, content, content_html")
    .eq("art_id", art.id)
    .maybeSingle();

  if (existing && existing.content) {
    const { data: latestRev } = await supabase
      .from("art_composition_revisions")
      .select("revision_number")
      .eq("art_id", art.id)
      .order("revision_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextRev = (latestRev?.revision_number || 0) + 1;
    await supabase.from("art_composition_revisions").insert({
      art_id: art.id,
      content: existing.content,
      content_html: existing.content_html,
      revision_number: nextRev,
    });
  }

  if (existing) {
    const { data, error } = await supabase
      .from("art_composition")
      .update({ content: revision.content, content_html: revision.content_html })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  }

  const { data, error } = await supabase
    .from("art_composition")
    .insert({
      art_id: art.id,
      content: revision.content,
      content_html: revision.content_html,
      status: "draft",
    })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
