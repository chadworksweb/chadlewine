import { createAdminClient } from "@/lib/supabase-server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Kind = "release" | "song";

interface InsertBody {
  sku_id: string;
  kind: Kind;
  url: string;
  alt?: string | null;
}

function parentCol(kind: Kind): "release_sku_id" | "song_sku_id" {
  return kind === "release" ? "release_sku_id" : "song_sku_id";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const skuId = url.searchParams.get("sku_id");
  const kind = url.searchParams.get("kind") as Kind | null;
  if (!skuId || !UUID_RE.test(skuId)) {
    return Response.json({ error: "sku_id required (uuid)" }, { status: 400 });
  }
  if (kind !== "release" && kind !== "song") {
    return Response.json({ error: "kind must be 'release' or 'song'" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("sku_images")
    .select("*")
    .eq(parentCol(kind), skuId)
    .is("deleted_at", null)
    .order("position", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ images: data || [] });
}

export async function POST(request: Request) {
  let body: InsertBody;
  try {
    body = (await request.json()) as InsertBody;
  } catch {
    return Response.json({ error: "JSON body required" }, { status: 400 });
  }

  const { sku_id: skuId, kind, url: imageUrl, alt } = body;
  if (!skuId || !UUID_RE.test(skuId)) {
    return Response.json({ error: "sku_id required (uuid)" }, { status: 400 });
  }
  if (kind !== "release" && kind !== "song") {
    return Response.json({ error: "kind must be 'release' or 'song'" }, { status: 400 });
  }
  if (!imageUrl || typeof imageUrl !== "string" || !/^https?:\/\//i.test(imageUrl)) {
    return Response.json({ error: "url required (absolute http/https)" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Verify the parent SKU exists.
  const parentTable = kind === "release" ? "release_skus" : "song_skus";
  const { data: parent } = await supabase
    .from(parentTable)
    .select("id")
    .eq("id", skuId)
    .maybeSingle();
  if (!parent) {
    return Response.json({ error: "SKU not found" }, { status: 404 });
  }

  const col = parentCol(kind);

  // Next position = max existing + 1 (or 0 for the first row).
  const { data: maxRow } = await supabase
    .from("sku_images")
    .select("position")
    .eq(col, skuId)
    .is("deleted_at", null)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = ((maxRow?.position as number | undefined) ?? -1) + 1;

  // First image becomes primary by default.
  const { count: existingCount } = await supabase
    .from("sku_images")
    .select("id", { count: "exact", head: true })
    .eq(col, skuId)
    .is("deleted_at", null);
  const isPrimary = (existingCount ?? 0) === 0;

  const { data: inserted, error: insertErr } = await supabase
    .from("sku_images")
    .insert({
      [col]: skuId,
      url: imageUrl,
      source: "custom",
      position: nextPosition,
      is_primary: isPrimary,
      alt: alt && alt.length > 0 ? alt : null,
    })
    .select("*")
    .single();

  if (insertErr) {
    return Response.json({ error: insertErr.message }, { status: 500 });
  }

  return Response.json({ image: inserted }, { status: 201 });
}
