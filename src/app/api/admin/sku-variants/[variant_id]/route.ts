import { createAdminClient } from "@/lib/supabase-server";
import { pickVariantFields } from "@/lib/sku-fields";

export async function PUT(request: Request, { params }: { params: Promise<{ variant_id: string }> }) {
  const { variant_id } = await params;
  const supabase = createAdminClient();
  const body = await request.json();
  const { updates, error: vErr } = pickVariantFields(body);
  if (vErr) return Response.json({ error: vErr }, { status: 400 });

  const { data, error } = await supabase
    .from("sku_variants")
    .update(updates)
    .eq("id", variant_id)
    .select()
    .single();
  if (error) {
    console.error("sku_variants update", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(data);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ variant_id: string }> }) {
  const { variant_id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase.from("sku_variants").delete().eq("id", variant_id);
  if (error) {
    console.error("sku_variants delete", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
