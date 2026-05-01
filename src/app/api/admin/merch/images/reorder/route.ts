import { createAdminClient } from "@/lib/supabase-server";
import { syncDerivedProductColumns } from "@/lib/product-images";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ReorderBody {
  product_id: string;
  ordered_ids: string[];
}

export async function POST(request: Request) {
  const body = (await request.json()) as ReorderBody;
  const productId = body.product_id;
  const orderedIds = body.ordered_ids;

  if (!productId || !UUID_RE.test(productId)) {
    return Response.json({ error: "product_id required (uuid)" }, { status: 400 });
  }
  if (!Array.isArray(orderedIds) || orderedIds.some((id) => !UUID_RE.test(id))) {
    return Response.json({ error: "ordered_ids must be an array of uuids" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // One UPDATE per row keeps the partial unique index (one_primary) safe and
  // avoids a stored-procedure round-trip. Volume is tiny (<50 rows per
  // product) so the chattiness is fine.
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("product_images")
      .update({ position: i, updated_at: new Date().toISOString() })
      .eq("id", orderedIds[i])
      .eq("product_id", productId);
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  await syncDerivedProductColumns(supabase, productId);

  return Response.json({ ok: true, count: orderedIds.length });
}
