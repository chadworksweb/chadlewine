import { createAdminClient } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Kind = "release" | "song";

interface ReorderBody {
  sku_id: string;
  kind: Kind;
  ordered_ids: string[];
}

export async function POST(request: Request) {
  const body = (await request.json()) as ReorderBody;
  const { sku_id: skuId, kind, ordered_ids: orderedIds } = body;

  if (!skuId || !UUID_RE.test(skuId)) {
    return Response.json({ error: "sku_id required (uuid)" }, { status: 400 });
  }
  if (kind !== "release" && kind !== "song") {
    return Response.json({ error: "kind must be 'release' or 'song'" }, { status: 400 });
  }
  if (!Array.isArray(orderedIds) || orderedIds.some((id) => !UUID_RE.test(id))) {
    return Response.json({ error: "ordered_ids must be an array of uuids" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const parentCol = kind === "release" ? "release_sku_id" : "song_sku_id";

  // One UPDATE per row -- small volume per SKU and keeps the partial unique
  // index (one_primary) safe even though we don't touch is_primary here.
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("sku_images")
      .update({ position: i, updated_at: new Date().toISOString() })
      .eq("id", orderedIds[i])
      .eq(parentCol, skuId);
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  return Response.json({ ok: true, count: orderedIds.length });
}
