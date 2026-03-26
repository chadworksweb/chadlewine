import { createAdminClient } from "@/lib/supabase-server";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, title, slug, created_at")
    .order("title");

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  const { title, slug } = body;

  if (!title) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }

  const finalSlug = slug?.trim() || slugify(title);

  const { data, error } = await supabase
    .from("categories")
    .insert({ title: title.trim(), slug: finalSlug })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
