import { createAdminClient } from "@/lib/supabase-server";
import {
  getAdminGalleryForProduct,
  syncDerivedProductColumns,
} from "@/lib/product-images";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface InsertBody {
  product_id: string;
  url: string;
  alt?: string | null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const productId = url.searchParams.get("product_id");
  if (!productId || !UUID_RE.test(productId)) {
    return Response.json({ error: "product_id required (uuid)" }, { status: 400 });
  }
  const supabase = createAdminClient();
  try {
    const images = await getAdminGalleryForProduct(supabase, productId);
    return Response.json({ images });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // Insertion is by URL only. The actual file upload is handled by the shared
  // MediaLibrary modal which writes to the site-image Bunny zone via
  // /api/admin/media/upload. This route just records the association.
  let body: InsertBody;
  try {
    body = (await request.json()) as InsertBody;
  } catch {
    return Response.json({ error: "JSON body required" }, { status: 400 });
  }

  const productId = body.product_id;
  const imageUrl = body.url;
  if (!productId || !UUID_RE.test(productId)) {
    return Response.json({ error: "product_id required (uuid)" }, { status: 400 });
  }
  if (!imageUrl || typeof imageUrl !== "string" || !/^https?:\/\//i.test(imageUrl)) {
    return Response.json({ error: "url required (absolute http/https)" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: product } = await supabase
    .from("merch")
    .select("id")
    .eq("id", productId)
    .maybeSingle();
  if (!product) {
    return Response.json({ error: "Product not found" }, { status: 404 });
  }

  const { data: maxRow } = await supabase
    .from("product_images")
    .select("position")
    .eq("product_id", productId)
    .is("deleted_at", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = ((maxRow?.position as number | undefined) ?? -1) + 1;

  const { data: inserted, error: insertErr } = await supabase
    .from("product_images")
    .insert({
      product_id: productId,
      url: imageUrl,
      source: "custom",
      position: nextPosition,
      alt: body.alt && body.alt.length > 0 ? body.alt : null,
    })
    .select("*")
    .single();

  if (insertErr) {
    return Response.json({ error: insertErr.message }, { status: 500 });
  }

  await syncDerivedProductColumns(supabase, productId);

  return Response.json({ image: inserted }, { status: 201 });
}
