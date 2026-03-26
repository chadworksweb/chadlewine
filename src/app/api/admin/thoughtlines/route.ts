import { createAdminClient } from "@/lib/supabase-server";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("thoughtlines")
    .select("id, title, slug, description, created_at")
    .order("title");

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  const { title, slug, description } = body;

  if (!title || !slug) {
    return Response.json({ error: "title and slug are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("thoughtlines")
    .insert({ title, slug, description: description || null })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
