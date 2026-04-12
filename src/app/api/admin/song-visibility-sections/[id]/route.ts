import { createAdminClient } from "@/lib/supabase-server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data, error } = await supabase.from("song_visibility_sections").select("*").eq("id", id).single();
  if (error) return Response.json({ error: error.message }, { status: 404 });
  return Response.json(data);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const body = await request.json();

  const allowed = ["content", "status", "display_order"];
  const updates: Record<string, unknown> = {};
  for (const f of allowed) { if (f in body) updates[f] = body[f]; }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("song_visibility_sections").update(updates).eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  const { data } = await supabase.from("song_visibility_sections").select("*").eq("id", id).single();
  return Response.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from("song_visibility_sections").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
