import { createAdminClient } from "@/lib/supabase-server";
import { slugify } from "@/lib/utils";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

async function pickUniqueSlug(supabase: SupabaseAdmin, base: string): Promise<string> {
  let slug = base;
  let n = 2;
  while (true) {
    const { data } = await supabase.from("products").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
    slug = `${base}-${n++}`;
    if (n > 50) return `${base}-${Date.now()}`;
  }
}

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();

  const title = (body.title as string | undefined)?.trim() || "Untitled";
  const requestedSlug = (body.slug as string | undefined)?.trim();
  const baseSlug = requestedSlug || slugify(title) || "product";
  const slug = await pickUniqueSlug(supabase, baseSlug);

  const { data, error } = await supabase
    .from("products")
    .insert({
      tier: body.tier || "art",
      fulfillment: body.fulfillment || "printify_curated",
      title,
      slug,
      description: body.description || null,
      source_observation_id: body.source_observation_id || null,
      printify_product_id: body.printify_product_id || null,
      price: body.price ?? null,
      image_url: body.image_url || null,
      image_alt: body.image_alt || null,
      status: body.status || "active",
      is_catalog_item: body.is_catalog_item ?? false,
      linked_art_piece_id: body.linked_art_piece_id || null,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
