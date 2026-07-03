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
    .from("psyche_effects")
    .select("id, slug, label, shadow, sort_order")
    .order("sort_order");

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();
  const { label, slug, shadow } = body;

  if (!label) {
    return Response.json({ error: "label is required" }, { status: 400 });
  }

  const finalSlug = slug?.trim() || slugify(label);

  // New effects sort after the existing ones by default (seekable group unless
  // flagged shadow). sort_order / shadow can be tuned later via PUT.
  const { data: maxRow } = await supabase
    .from("psyche_effects")
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from("psyche_effects")
    .insert({
      label: label.trim(),
      slug: finalSlug,
      shadow: shadow === true,
      sort_order: typeof body.sort_order === "number" ? body.sort_order : nextOrder,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
