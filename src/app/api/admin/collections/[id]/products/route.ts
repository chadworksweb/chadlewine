import { createAdminClient } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveCollectionId(
  supabase: ReturnType<typeof createAdminClient>,
  idOrSlug: string,
): Promise<string | null> {
  if (UUID_RE.test(idOrSlug)) return idOrSlug;
  const { data } = await supabase
    .from("collections")
    .select("id")
    .eq("slug", idOrSlug)
    .maybeSingle();
  return data?.id ?? null;
}

// GET: list products in this collection (in position order), plus the
// remaining unassigned active products (for the picker UI).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const collectionId = await resolveCollectionId(supabase, idOrSlug);
  if (!collectionId) return Response.json({ error: "Collection not found" }, { status: 404 });

  const { data: assignments, error: assignErr } = await supabase
    .from("collection_products")
    .select("product_id, position")
    .eq("collection_id", collectionId)
    .order("position", { ascending: true });

  if (assignErr) return Response.json({ error: assignErr.message }, { status: 500 });

  const assignedIds = (assignments || []).map((a) => a.product_id);

  const { data: assignedProducts } = assignedIds.length
    ? await supabase
        .from("merch")
        .select("id, slug, title, image_url, image_alt, status, fulfillment, price")
        .in("id", assignedIds)
    : { data: [] };

  const productById = new Map((assignedProducts || []).map((p) => [p.id, p]));
  const inCollection = (assignments || []).map((a) => ({
    ...productById.get(a.product_id),
    position: a.position,
  }));

  const { data: unassigned } = await supabase
    .from("merch")
    .select("id, slug, title, image_url, image_alt, status, fulfillment, price")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const unassignedFiltered = (unassigned || []).filter(
    (p) => !assignedIds.includes(p.id)
  );

  return Response.json({
    in_collection: inCollection,
    available: unassignedFiltered,
  });
}

// POST: add a product to this collection. Body: { product_id }.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const collectionId = await resolveCollectionId(supabase, idOrSlug);
  if (!collectionId) return Response.json({ error: "Collection not found" }, { status: 404 });

  const body = await request.json();
  const productId = body.product_id;
  if (!productId || typeof productId !== "string") {
    return Response.json({ error: "product_id required" }, { status: 400 });
  }

  const { data: maxRow } = await supabase
    .from("collection_products")
    .select("position")
    .eq("collection_id", collectionId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = (maxRow?.position ?? -1) + 1;

  const { error } = await supabase.from("collection_products").insert({
    collection_id: collectionId,
    product_id: productId,
    position: nextPosition,
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

// DELETE: remove a product from this collection. Query: ?product_id=...
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idOrSlug } = await params;
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("product_id");
  if (!productId) return Response.json({ error: "product_id required" }, { status: 400 });

  const supabase = createAdminClient();
  const collectionId = await resolveCollectionId(supabase, idOrSlug);
  if (!collectionId) return Response.json({ error: "Collection not found" }, { status: 404 });

  const { error } = await supabase
    .from("collection_products")
    .delete()
    .eq("collection_id", collectionId)
    .eq("product_id", productId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

// PUT: reorder products in this collection. Body: { product_ids: string[] }.
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const collectionId = await resolveCollectionId(supabase, idOrSlug);
  if (!collectionId) return Response.json({ error: "Collection not found" }, { status: 404 });

  const body = await request.json();
  const productIds = body.product_ids;
  if (!Array.isArray(productIds)) {
    return Response.json({ error: "product_ids array required" }, { status: 400 });
  }

  for (let i = 0; i < productIds.length; i++) {
    const { error } = await supabase
      .from("collection_products")
      .update({ position: i })
      .eq("collection_id", collectionId)
      .eq("product_id", productIds[i]);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
