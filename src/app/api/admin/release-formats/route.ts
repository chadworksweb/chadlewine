import { createAdminClient } from "@/lib/supabase-server";
import { slugify } from "@/lib/utils";

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("release_formats")
    .select("*")
    .order("label");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  if (!body.label) return Response.json({ error: "label required" }, { status: 400 });

  const { data, error } = await supabase
    .from("release_formats")
    .insert({
      label: body.label.trim(),
      slug: body.slug?.trim() || slugify(body.label),
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
