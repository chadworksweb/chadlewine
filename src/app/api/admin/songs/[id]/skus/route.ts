import { createAdminClient } from "@/lib/supabase-server";
import { pickSkuFields } from "@/lib/sku-fields";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveSongId(
  supabase: ReturnType<typeof createAdminClient>,
  idOrSlug: string,
): Promise<string | null> {
  if (UUID_RE.test(idOrSlug)) return idOrSlug;
  const { data } = await supabase.from("songs").select("id").eq("slug", idOrSlug).maybeSingle();
  return data?.id ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const songId = await resolveSongId(supabase, idOrSlug);
  if (!songId) return Response.json([], { status: 200 });

  const { data: skus, error } = await supabase
    .from("song_skus")
    .select("*")
    .eq("song_id", songId)
    .order("display_order")
    .order("created_at");
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const ids = (skus || []).map((s) => s.id);
  let variants: Record<string, unknown[]> = {};
  if (ids.length > 0) {
    const { data: vRows, error: vErr } = await supabase
      .from("sku_variants")
      .select("*")
      .in("song_sku_id", ids)
      .order("display_order")
      .order("created_at");
    if (vErr) return Response.json({ error: vErr.message }, { status: 500 });
    variants = (vRows || []).reduce<Record<string, unknown[]>>((acc, v) => {
      const key = v.song_sku_id as string;
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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idOrSlug } = await params;
  const supabase = createAdminClient();
  const songId = await resolveSongId(supabase, idOrSlug);
  if (!songId) return Response.json({ error: "song not found" }, { status: 404 });

  const body = await request.json();
  const { updates, error: vErr } = pickSkuFields(body);
  if (vErr) return Response.json({ error: vErr }, { status: 400 });
  if (!updates.format) return Response.json({ error: "format required" }, { status: 400 });

  if (!updates.sku_code) {
    const { data: song } = await supabase
      .from("songs")
      .select("slug")
      .eq("id", songId)
      .single();
    if (song?.slug) {
      updates.sku_code = `CL-${String(song.slug).toUpperCase()}-${String(updates.format).toUpperCase()}`;
    }
  }

  const { data, error } = await supabase
    .from("song_skus")
    .insert({ ...updates, song_id: songId })
    .select()
    .single();
  if (error) {
    console.error("song_skus insert", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ...data, variants: [] }, { status: 201 });
}
