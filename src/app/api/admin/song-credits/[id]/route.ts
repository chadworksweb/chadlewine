import { createAdminClient } from "@/lib/supabase-server";
import { isCreditRole } from "@/lib/song-credits";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if ("role" in body) {
    if (!isCreditRole(body.role)) return Response.json({ error: "invalid role" }, { status: 400 });
    updates.role = body.role;
  }
  if ("name" in body) {
    if (!body.name?.trim()) return Response.json({ error: "name required" }, { status: 400 });
    updates.name = body.name.trim();
  }
  if ("display_order" in body) updates.display_order = body.display_order;

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from("song_credits").update(updates).eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  const { data } = await supabase.from("song_credits").select("*").eq("id", id).single();
  return Response.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from("song_credits").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
