import { createAdminClient } from "@/lib/supabase-server";
import { slugify } from "@/lib/utils";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

async function pickUniqueSlug(supabase: SupabaseAdmin, base: string): Promise<string> {
  let slug = base;
  let n = 2;
  while (true) {
    const { data } = await supabase.from("collections").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
    slug = `${base}-${n++}`;
    if (n > 50) return `${base}-${Date.now()}`;
  }
}

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("collections")
    .select("id, slug, title, description, status, sort_order, created_at, updated_at")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const ids = (data || []).map((c) => c.id);
  let counts: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: cp } = await supabase
      .from("collection_products")
      .select("collection_id")
      .in("collection_id", ids);
    counts = (cp || []).reduce<Record<string, number>>((acc, r) => {
      acc[r.collection_id] = (acc[r.collection_id] || 0) + 1;
      return acc;
    }, {});
  }

  return Response.json(
    (data || []).map((c) => ({ ...c, product_count: counts[c.id] || 0 }))
  );
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();

  const title = (body.title as string | undefined)?.trim() || "Untitled Collection";
  const requestedSlug = (body.slug as string | undefined)?.trim();
  const baseSlug = requestedSlug || slugify(title) || "collection";
  const slug = await pickUniqueSlug(supabase, baseSlug);

  const { data, error } = await supabase
    .from("collections")
    .insert({
      slug,
      title,
      description: (body.description as string | undefined) || null,
      status: body.status === "archived" ? "archived" : "active",
      sort_order: typeof body.sort_order === "number" ? body.sort_order : 0,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
