import { createAdminClient } from "@/lib/supabase-server";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createAdminClient();

  const { data: art, error: artErr } = await supabase
    .from("art_pieces")
    .select("id")
    .eq("slug", slug)
    .single();
  if (artErr || !art) return Response.json({ error: "art piece not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("merch")
    .select("id, tier, title, description, price, status, variant_type, variant_label, edition_size, editions_sold, image_url, image_alt, fulfillment, source_art_id, created_at")
    .eq("source_art_id", art.id)
    .order("variant_type", { ascending: true })
    .order("price", { ascending: true, nullsFirst: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json(data);
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const body = await request.json();

  const variantType = body.variant_type;
  if (variantType !== "original" && variantType !== "print") {
    return Response.json({ error: "variant_type must be 'original' or 'print'" }, { status: 400 });
  }

  const { data: art, error: artErr } = await supabase
    .from("art_pieces")
    .select("id, title, description, image_path, image_alt")
    .eq("slug", slug)
    .single();
  if (artErr || !art) return Response.json({ error: "art piece not found" }, { status: 404 });

  const variantLabel: string | null = body.variant_label || null;
  const priceRaw = body.price;
  const price: number | null = typeof priceRaw === "number" ? priceRaw : priceRaw ? parseFloat(priceRaw) : null;
  const editionSizeRaw = body.edition_size;
  const editionSize: number =
    variantType === "original"
      ? 1
      : typeof editionSizeRaw === "number"
      ? editionSizeRaw
      : editionSizeRaw
      ? parseInt(editionSizeRaw)
      : 0;

  const titleParts = [art.title, variantLabel || (variantType === "original" ? "Original" : "Print")].filter(Boolean);
  const productTitle = titleParts.join(" — ");

  const { data: product, error } = await supabase
    .from("merch")
    .insert({
      tier: variantType === "original" ? "art_original" : "art_print",
      fulfillment: "manual",
      title: productTitle,
      description: art.description,
      price,
      image_url: art.image_path,
      image_alt: art.image_alt,
      status: "active",
      variant_type: variantType,
      variant_label: variantLabel,
      edition_size: editionSize,
      editions_sold: 0,
      source_art_id: art.id,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(product, { status: 201 });
}
