import { createAdminClient } from "@/lib/supabase-server";
import { slugify } from "@/lib/utils";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("thoughts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();

  if (!body.title) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("thoughts")
    .insert({
      title: body.title.trim(),
      slug: body.slug?.trim() || slugify(body.title),
      description: body.description || null,
      status: body.status || "draft",
      published_at: body.status === "published" ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
