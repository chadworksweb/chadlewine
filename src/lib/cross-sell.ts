import { createPublicClient } from "@/lib/supabase-server";
import { isSectionLive } from "@/lib/feature-flags";

// Forward cross-sell core, shared by the cart drawer (/api/cross-sell) and the
// post-purchase thank-you strip (/api/cross-sell/from-session). For music refs
// (release/song) it returns the merch curated onto that release/song via the
// YMAL graph (related_entities, entity_type=merch); songs inherit their parent
// release's merch. Anything already owned (merch refs) is excluded.

export interface CartRef { type?: string; id?: string }
export interface CrossSellProduct {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  image_alt: string | null;
  price: number | null;
  variants: unknown;
}

export async function computeCrossSell(items: CartRef[], limit = 6): Promise<CrossSellProduct[]> {
  if (!(await isSectionLive("merch"))) return [];

  const releaseIds = new Set<string>();
  const songIds = new Set<string>();
  const ownedProductIds = new Set<string>();
  for (const it of items) {
    if (!it?.id) continue;
    if (it.type === "release") releaseIds.add(it.id);
    else if (it.type === "song" || it.type === "ringtone") songIds.add(it.id);
    else if (it.type === "merch") ownedProductIds.add(it.id);
  }

  if (releaseIds.size === 0 && songIds.size === 0) return [];

  const supabase = createPublicClient();

  if (songIds.size > 0) {
    const { data: parents } = await supabase
      .from("release_songs")
      .select("release_id")
      .in("song_id", Array.from(songIds));
    for (const r of parents || []) releaseIds.add(r.release_id);
  }

  const [relRes, songRes] = await Promise.all([
    releaseIds.size > 0
      ? supabase.from("related_entities").select("entity_id, display_order")
          .eq("source_type", "release").eq("entity_type", "merch")
          .in("source_id", Array.from(releaseIds)).order("display_order")
      : Promise.resolve({ data: [] as { entity_id: string }[] }),
    songIds.size > 0
      ? supabase.from("related_entities").select("entity_id, display_order")
          .eq("source_type", "song").eq("entity_type", "merch")
          .in("source_id", Array.from(songIds)).order("display_order")
      : Promise.resolve({ data: [] as { entity_id: string }[] }),
  ]);

  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (rows: { entity_id: string }[]) => {
    for (const r of rows) {
      if (ownedProductIds.has(r.entity_id) || seen.has(r.entity_id)) continue;
      seen.add(r.entity_id);
      ordered.push(r.entity_id);
    }
  };
  push(relRes.data || []);
  push(songRes.data || []);
  if (ordered.length === 0) return [];

  const { data: products } = await supabase
    .from("merch")
    .select("id, slug, title, image_url, image_alt, price, variants")
    .in("id", ordered)
    .eq("status", "active");

  const byId = new Map((products || []).map((p) => [p.id, p as CrossSellProduct]));
  return ordered.map((id) => byId.get(id)).filter(Boolean).slice(0, limit) as CrossSellProduct[];
}
