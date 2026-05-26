import { createAdminClient } from "@/lib/supabase-server";
import { pickArtSkuFields } from "@/lib/art-sku-fields";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveArtId(
  supabase: ReturnType<typeof createAdminClient>,
  idOrSlug: string,
): Promise<string | null> {
  if (UUID_RE.test(idOrSlug)) return idOrSlug;
  const { data } = await supabase.from("art_pieces").select("id").eq("slug", idOrSlug).maybeSingle();
  return data?.id ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const artId = await resolveArtId(supabase, slug);
  if (!artId) return Response.json([], { status: 200 });

  const { data: skus, error } = await supabase
    .from("art_skus")
    .select("*")
    .eq("art_id", artId)
    .order("display_order")
    .order("created_at");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const ids = (skus || []).map((s) => s.id);
  let variants: Record<string, unknown[]> = {};
  if (ids.length > 0) {
    const { data: vRows, error: vErr } = await supabase
      .from("sku_variants")
      .select("*")
      .in("art_sku_id", ids)
      .order("display_order")
      .order("created_at");
    if (vErr) return Response.json({ error: vErr.message }, { status: 500 });
    variants = (vRows || []).reduce<Record<string, unknown[]>>((acc, v) => {
      const key = v.art_sku_id as string;
      (acc[key] = acc[key] || []).push(v);
      return acc;
    }, {});
  }

  const enriched = (skus || []).map((s) => ({
    ...s,
    variants: variants[s.id as string] || [],
  }));

  return Response.json(enriched);
}

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createAdminClient();
  const artId = await resolveArtId(supabase, slug);
  if (!artId) return Response.json({ error: "art piece not found" }, { status: 404 });

  const body = await request.json();
  const { updates, error: vErr } = pickArtSkuFields(body);
  if (vErr) return Response.json({ error: vErr }, { status: 400 });
  if (!updates.format) return Response.json({ error: "format required" }, { status: 400 });

  if (!updates.sku_code) {
    const { data: art } = await supabase
      .from("art_pieces")
      .select("slug")
      .eq("id", artId)
      .single();
    if (art?.slug) {
      const suffix = updates.format === "original" ? "ORIGINAL" : "PRINT";
      updates.sku_code = `CL-${String(art.slug).toUpperCase()}-${suffix}`;
    }
  }

  const { data, error } = await supabase
    .from("art_skus")
    .insert({ ...updates, art_id: artId })
    .select()
    .single();
  if (error) {
    console.error("art_skus insert", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ...data, variants: [] }, { status: 201 });
}
