import { createAdminClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("domains")
    .select("id, slug, label, sort_order")
    .order("sort_order");

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  const { label, slug } = body;

  if (!label || !slug) {
    return Response.json({ error: "label and slug are required" }, { status: 400 });
  }

  // Get next sort_order
  const { data: last } = await supabase
    .from("domains")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .single();

  const sort_order = (last?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("domains")
    .insert({ label, slug, sort_order })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
