import { createAdminClient } from "@/lib/supabase-server";
import { pickVariantFields } from "@/lib/sku-fields";
import { slugify } from "@/lib/utils";

export async function POST(request: Request) {
  const supabase = createAdminClient();
  const body = await request.json();

  const releaseSkuId = body.release_sku_id || null;
  const songSkuId = body.song_sku_id || null;
  const artSkuId = body.art_sku_id || null;
  const parentCount =
    Number(!!releaseSkuId) + Number(!!songSkuId) + Number(!!artSkuId);
  if (parentCount !== 1) {
    return Response.json(
      { error: "exactly one of release_sku_id, song_sku_id, or art_sku_id is required" },
      { status: 400 },
    );
  }

  const { updates, error: vErr } = pickVariantFields(body);
  if (vErr) return Response.json({ error: vErr }, { status: 400 });
  if (!updates.label) return Response.json({ error: "label required" }, { status: 400 });

  if (!updates.variant_slug) {
    updates.variant_slug = slugify(String(updates.label));
  }

  const insert: Record<string, unknown> = {
    ...updates,
    release_sku_id: releaseSkuId,
    song_sku_id: songSkuId,
    art_sku_id: artSkuId,
  };

  const { data, error } = await supabase
    .from("sku_variants")
    .insert(insert)
    .select()
    .single();
  if (error) {
    console.error("sku_variants insert", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(data, { status: 201 });
}
