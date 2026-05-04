import { createAdminClient } from "@/lib/supabase-server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = createAdminClient();
  const body = await request.json();
  const order = typeof body.display_order === "number" ? body.display_order : null;
  if (order === null) return Response.json({ error: "display_order required" }, { status: 400 });

  const { data, error } = await supabase
    .from("homepage_hero")
    .update({ display_order: order })
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from("homepage_hero").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
