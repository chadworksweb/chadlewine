import { createAdminClient } from "@/lib/supabase-server";
import { pickSkuFields } from "@/lib/sku-fields";

export async function GET(_req: Request, { params }: { params: Promise<{ sku_id: string }> }) {
  const { sku_id } = await params;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("song_skus")
    .select("*")
    .eq("id", sku_id)
    .single();
  if (error) return Response.json({ error: error.message }, { status: 404 });

  const { data: variants } = await supabase
    .from("sku_variants")
    .select("*")
    .eq("song_sku_id", sku_id)
    .order("display_order")
    .order("created_at");

  return Response.json({ ...data, variants: variants || [] });
}

export async function PUT(request: Request, { params }: { params: Promise<{ sku_id: string }> }) {
  const { sku_id } = await params;
  const supabase = createAdminClient();
  const body = await request.json();
  const { updates, error: vErr } = pickSkuFields(body);
  if (vErr) return Response.json({ error: vErr }, { status: 400 });

  const { data, error } = await supabase
    .from("song_skus")
    .update(updates)
    .eq("id", sku_id)
    .select()
    .single();
  if (error) {
    console.error("song_skus update", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ sku_id: string }> }) {
  const { sku_id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from("song_skus").delete().eq("id", sku_id);
  if (error) {
    console.error("song_skus delete", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
