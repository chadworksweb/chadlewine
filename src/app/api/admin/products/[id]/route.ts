import { createAdminClient } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveProductId(
  supabase: ReturnType<typeof createAdminClient>,
  idOrSlug: string,
): Promise<string | null> {
  if (UUID_RE.test(idOrSlug)) return idOrSlug;
  const { data } = await supabase.from("merch").select("id").eq("slug", idOrSlug).maybeSingle();
  return data?.id ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const field = UUID_RE.test(idOrSlug) ? "id" : "slug";
  const { data, error } = await supabase
    .from("merch")
    .select("*")
    .eq(field, idOrSlug)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 404 });
  return Response.json(data);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const id = await resolveProductId(supabase, idOrSlug);
  if (!id) return Response.json({ error: "Product not found" }, { status: 404 });
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  const fields = ["fulfillment", "title", "slug", "description", "seo_title", "seo_description", "printify_product_id", "price", "status", "image_url", "image_alt", "hero_focal_x", "hero_focal_y", "hero_zoom", "linked_art_piece_id", "merch_type_id", "release_sku_id", "display_order", "shipping_first_cents", "shipping_addl_cents", "shipping_ca_first_cents", "shipping_ca_addl_cents", "shipping_uk_first_cents", "shipping_uk_addl_cents", "shipping_row_first_cents", "shipping_row_addl_cents", "free_shipping_exempt", "is_new"];
  for (const f of fields) {
    if (f in body) updates[f] = body[f];
  }

  const { data, error } = await supabase
    .from("merch")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const id = await resolveProductId(supabase, idOrSlug);
  if (!id) return Response.json({ error: "Product not found" }, { status: 404 });
  const { error } = await supabase.from("merch").delete().eq("id", id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
