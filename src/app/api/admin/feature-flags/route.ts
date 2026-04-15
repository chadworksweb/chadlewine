import { createAdminClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("feature_flags")
    .select("section,is_live,updated_at")
    .order("section", { ascending: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function PATCH(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  const section = typeof body.section === "string" ? body.section : null;
  const isLive = typeof body.is_live === "boolean" ? body.is_live : null;
  if (!section || isLive === null) {
    return Response.json({ error: "section and is_live required" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("feature_flags")
    .update({ is_live: isLive })
    .eq("section", section)
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
