import { createAdminClient } from "@/lib/supabase-server";
import { slugify } from "@/lib/utils";

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

async function pickUniqueSlug(supabase: SupabaseAdmin, base: string): Promise<string> {
  let slug = base;
  let n = 2;
  while (true) {
    const { data } = await supabase.from("merch").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
    slug = `${base}-${n++}`;
    if (n > 50) return `${base}-${Date.now()}`;
  }
}

export async function GET() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("merch")
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
    .from("merch")
    .insert({
      // tier retired as a category; column is now nullable (art-merch products
      // get tier set to art_print/art_original by the art-products route).
      tier: body.tier ?? null,
      merch_type_id: body.merch_type_id ?? null,
      release_sku_id: body.release_sku_id ?? null,
      fulfillment: body.fulfillment || "printify_curated",
      title,
      slug,
      description: body.description || null,
      seo_title: body.seo_title || null,
      seo_description: body.seo_description || null,
      printify_product_id: body.printify_product_id || null,
      price: body.price ?? null,
      image_url: body.image_url || null,
      image_alt: body.image_alt || null,
      status: body.status || "active",
      linked_art_piece_id: body.linked_art_piece_id || null,
      shipping_first_cents: body.shipping_first_cents ?? null,
      shipping_addl_cents: body.shipping_addl_cents ?? null,
      shipping_ca_first_cents: body.shipping_ca_first_cents ?? null,
      shipping_ca_addl_cents: body.shipping_ca_addl_cents ?? null,
      shipping_uk_first_cents: body.shipping_uk_first_cents ?? null,
      shipping_uk_addl_cents: body.shipping_uk_addl_cents ?? null,
      shipping_row_first_cents: body.shipping_row_first_cents ?? null,
      shipping_row_addl_cents: body.shipping_row_addl_cents ?? null,
      free_shipping_exempt: body.free_shipping_exempt ?? false,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data, { status: 201 });
}
