import { createAdminClient } from "@/lib/supabase-server";
import { resolveSkuDownloadPaths } from "@/lib/release-skus";
import { DOWNLOAD_FORMATS, type DownloadFormat } from "@/lib/audio-formats";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) return Response.json({ error: "Token required" }, { status: 400 });

  const supabase = createAdminClient();

  const { data: row } = await supabase
    .from("recovery_tokens")
    .select("email, expires_at")
    .eq("token", token)
    .single();

  if (!row) return Response.json({ error: "Invalid token" }, { status: 404 });
  if (new Date(row.expires_at) < new Date()) {
    return Response.json({ error: "Token expired" }, { status: 410 });
  }

  const { data: purchases } = await supabase
    .from("purchases")
    .select("id, item_type, item_id, format, amount, created_at, release_sku_id, song_sku_id")
    .ilike("buyer_email", row.email)
    .in("item_type", ["song", "release"])
    .order("created_at", { ascending: false });

  if (!purchases || purchases.length === 0) {
    return Response.json({ email: row.email, items: [] });
  }

  // Resolve titles + per-format availability. SKU rows own the download
  // paths; purchases without a SKU reference have no path source and surface
  // empty links rather than 500.
  const songIds = purchases
    .filter((p) => p.item_type === "song")
    .map((p) => p.item_id)
    .filter((v): v is string => !!v);
  const albumIds = purchases
    .filter((p) => p.item_type === "release")
    .map((p) => p.item_id)
    .filter((v): v is string => !!v);
  const releaseSkuIds = purchases
    .map((p) => p.release_sku_id)
    .filter((v): v is string => !!v);
  const songSkuIds = purchases
    .map((p) => p.song_sku_id)
    .filter((v): v is string => !!v);

  type FormatKey = DownloadFormat;
  const FORMATS: readonly FormatKey[] = DOWNLOAD_FORMATS;

  const [{ data: songs }, { data: albums }, skuPaths] = await Promise.all([
    songIds.length
      ? supabase
          .from("songs")
          .select("id, title, slug")
          .in("id", songIds)
      : Promise.resolve({ data: [] as Array<{
          id: string; title: string; slug: string;
        }> }),
    albumIds.length
      ? supabase
          .from("releases")
          .select("id, title, slug, cover_art_path")
          .in("id", albumIds)
      : Promise.resolve({ data: [] as Array<{
          id: string; title: string; slug: string; cover_art_path: string | null;
        }> }),
    // Effective paths: physical SKUs fall back to the sibling digital SKU,
    // so a vinyl/cd buyer recovers the included digital copy here too.
    resolveSkuDownloadPaths(supabase, releaseSkuIds, songSkuIds),
  ]);

  const songMap = new Map((songs || []).map((s) => [s.id, s]));
  const albumMap = new Map((albums || []).map((a) => [a.id, a]));
  const { byReleaseSku, bySongSku } = skuPaths;

  const items = purchases.map((p) => {
    const rec =
      p.item_type === "song"
        ? p.item_id ? songMap.get(p.item_id) : undefined
        : p.item_id ? albumMap.get(p.item_id) : undefined;

    let pathSource: Record<FormatKey, string | null> | undefined;
    if (p.release_sku_id) {
      pathSource = byReleaseSku.get(p.release_sku_id);
    } else if (p.song_sku_id) {
      pathSource = bySongSku.get(p.song_sku_id);
    }

    const available = pathSource
      ? FORMATS.filter((f) => pathSource![f])
      : [];

    const tokenBase = `/api/download/${p.id}`;
    const formatLinks: Array<{ format: FormatKey; url: string }> = p.format
      ? [{ format: p.format as FormatKey, url: tokenBase }]
      : available.map((f) => ({ format: f, url: `${tokenBase}?format=${f}` }));

    const base = {
      purchase_id: p.id,
      item_type: p.item_type,
      format: p.format || null,
      amount: p.amount,
      created_at: p.created_at,
      formatLinks,
    };
    if (p.item_type === "song") {
      return { ...base, title: rec?.title || "Song", slug: rec?.slug || null, cover_art_path: null };
    }
    const a = rec as { cover_art_path?: string | null } | undefined;
    return { ...base, title: rec?.title || "Album", slug: rec?.slug || null, cover_art_path: a?.cover_art_path || null };
  });

  return Response.json({ email: row.email, items });
}
