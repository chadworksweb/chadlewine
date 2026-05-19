import { getCurrentSession } from "@/lib/account";
import { createAdminClient } from "@/lib/supabase-server";

// Returns all digital purchases for the signed-in customer, enriched with
// per-format download URLs (signed by /api/download/[purchaseId]). Mirrors
// the recovery-flow shape so the same renderer can be reused if needed.

type FormatKey = "mp3" | "flac" | "wav";
const FORMATS: FormatKey[] = ["mp3", "flac", "wav"];

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const supabase = createAdminClient();

  const { data: purchases } = await supabase
    .from("purchases")
    .select(
      "id, item_type, item_id, format, amount, created_at, order_id, title_snapshot, release_sku_id, song_sku_id",
    )
    .eq("audience_id", session.audienceId)
    .in("item_type", ["song", "release", "ringtone"])
    .order("created_at", { ascending: false });

  if (!purchases || purchases.length === 0) {
    return Response.json({ items: [] });
  }

  const songIds = purchases
    .filter((p) => p.item_type === "song" || p.item_type === "ringtone")
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

  const [songsRes, albumsRes, releaseSkusRes, songSkusRes] = await Promise.all([
    songIds.length
      ? supabase
          .from("songs")
          .select(
            "id, title, slug, download_path_mp3, download_path_flac, download_path_wav, download_path",
          )
          .in("id", songIds)
      : Promise.resolve({ data: [] as Array<{
          id: string; title: string; slug: string;
          download_path_mp3: string | null; download_path_flac: string | null;
          download_path_wav: string | null; download_path: string | null;
        }> }),
    albumIds.length
      ? supabase
          .from("releases")
          .select("id, title, slug, cover_art_path")
          .in("id", albumIds)
      : Promise.resolve({ data: [] as Array<{
          id: string; title: string; slug: string; cover_art_path: string | null;
        }> }),
    releaseSkuIds.length
      ? supabase
          .from("release_skus")
          .select("id, download_path_mp3, download_path_flac, download_path_wav")
          .in("id", releaseSkuIds)
      : Promise.resolve({ data: [] as Array<{
          id: string;
          download_path_mp3: string | null; download_path_flac: string | null;
          download_path_wav: string | null;
        }> }),
    songSkuIds.length
      ? supabase
          .from("song_skus")
          .select("id, download_path_mp3, download_path_flac, download_path_wav")
          .in("id", songSkuIds)
      : Promise.resolve({ data: [] as Array<{
          id: string;
          download_path_mp3: string | null; download_path_flac: string | null;
          download_path_wav: string | null;
        }> }),
  ]);

  const songMap = new Map((songsRes.data || []).map((s) => [s.id, s]));
  const albumMap = new Map((albumsRes.data || []).map((a) => [a.id, a]));
  const releaseSkuMap = new Map((releaseSkusRes.data || []).map((s) => [s.id, s]));
  const songSkuMap = new Map((songSkusRes.data || []).map((s) => [s.id, s]));

  const items = purchases.map((p) => {
    const rec = p.item_type === "release"
      ? p.item_id ? albumMap.get(p.item_id) : undefined
      : p.item_id ? songMap.get(p.item_id) : undefined;

    // Per-format availability: prefer SKU-attached download paths; legacy
    // purchases (no SKU id) fall back to songs.download_path_* for songs.
    // Legacy releases have no path source (releases.download_path_* dropped) —
    // their links surface empty.
    let pathSource: Record<string, string | null | undefined> | undefined;
    if (p.release_sku_id) {
      pathSource = releaseSkuMap.get(p.release_sku_id);
    } else if (p.song_sku_id) {
      pathSource = songSkuMap.get(p.song_sku_id);
    } else if (p.item_type === "song" || p.item_type === "ringtone") {
      pathSource = rec as Record<string, string | null | undefined> | undefined;
    }

    const available: FormatKey[] = pathSource
      ? FORMATS.filter((f) => pathSource![`download_path_${f}`])
      : [];
    if (
      !available.length &&
      (p.item_type === "song" || p.item_type === "ringtone") &&
      (rec as { download_path?: string | null } | undefined)?.download_path
    ) {
      available.push("mp3");
    }

    const tokenBase = `/api/download/${p.id}`;
    const formatLinks = p.format
      ? [{ format: p.format as FormatKey, url: tokenBase }]
      : available.map((f) => ({ format: f, url: `${tokenBase}?format=${f}` }));

    return {
      purchase_id: p.id,
      order_id: p.order_id,
      item_type: p.item_type,
      title: rec?.title || p.title_snapshot || "Untitled",
      slug: rec?.slug || null,
      cover_art_path:
        p.item_type === "release"
          ? (rec as { cover_art_path?: string | null } | undefined)?.cover_art_path || null
          : null,
      amount: p.amount,
      created_at: p.created_at,
      formatLinks,
    };
  });

  return Response.json({ items });
}
