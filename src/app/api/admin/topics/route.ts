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
    .from("topics")
    .select("id, slug, label, created_at")
    .order("label");

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  const { label, slug } = body;

  if (!label) {
    return Response.json({ error: "label is required" }, { status: 400 });
  }

  const finalSlug = slug?.trim() || slugify(label);

  const { data, error } = await supabase
    .from("topics")
    .insert({ label: label.trim(), slug: finalSlug })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
