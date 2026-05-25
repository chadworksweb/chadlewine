import { createPublicClient } from "@/lib/supabase-server";
import { isSectionLive } from "@/lib/feature-flags";

// POST /api/cross-sell
//   body: { items: [{ type, id }] }  (the current cart)
//
// Forward cross-sell: for music in the cart (releases + songs), suggest the
// products curated onto that release/song's merch section. Songs also inherit
// their parent release's merch (same union as the song page). Products already
// in the cart are excluded. Returns active products with their variants so the
// client can one-click-add single-variant items and link out for the rest.

interface CartRef { type?: string; id?: string }
interface ProductOut {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  image_alt: string | null;
  price: number | null;
  variants: unknown;
}

function payloadIds(data_payload: unknown): string[] {
  const ids = (data_payload as { product_ids?: string[] } | null)?.product_ids;
  return Array.isArray(ids) ? ids : [];
}

export async function POST(request: Request) {
  if (!(await isSectionLive("merch"))) return Response.json({ products: [] });

  let body: { items?: CartRef[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ products: [] });
  }
  const items = Array.isArray(body.items) ? body.items : [];

  const releaseIds = new Set<string>();
  const songIds = new Set<string>();
  const cartProductIds = new Set<string>();
  for (const it of items) {
    if (!it?.id) continue;
    if (it.type === "release") releaseIds.add(it.id);
    else if (it.type === "song" || it.type === "ringtone") songIds.add(it.id);
    else if (it.type === "merch") cartProductIds.add(it.id);
  }

  if (releaseIds.size === 0 && songIds.size === 0) {
    return Response.json({ products: [] });
  }

  const supabase = createPublicClient();

  // Songs inherit their parent release's merch -> fold parent releases in.
  if (songIds.size > 0) {
    const { data: parents } = await supabase
      .from("release_songs")
      .select("release_id")
      .in("song_id", Array.from(songIds));
    for (const r of parents || []) releaseIds.add(r.release_id);
  }

  const [relSecRes, songSecRes] = await Promise.all([
    releaseIds.size > 0
      ? supabase
          .from("release_visibility_sections")
          .select("data_payload")
          .in("release_id", Array.from(releaseIds))
          .eq("category", "merch")
          .eq("status", "published")
      : Promise.resolve({ data: [] as { data_payload: unknown }[] }),
    songIds.size > 0
      ? supabase
          .from("song_visibility_sections")
          .select("data_payload")
          .in("song_id", Array.from(songIds))
          .eq("category", "merch")
          .eq("status", "published")
      : Promise.resolve({ data: [] as { data_payload: unknown }[] }),
  ]);

  // Collect candidate product ids in a stable order, dropping cart items + dupes.
  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (ids: string[]) => {
    for (const id of ids) {
      if (cartProductIds.has(id) || seen.has(id)) continue;
      seen.add(id);
      ordered.push(id);
    }
  };
  for (const s of relSecRes.data || []) push(payloadIds(s.data_payload));
  for (const s of songSecRes.data || []) push(payloadIds(s.data_payload));

  if (ordered.length === 0) return Response.json({ products: [] });

  const { data: products } = await supabase
    .from("products")
    .select("id, slug, title, image_url, image_alt, price, variants")
    .in("id", ordered)
    .eq("status", "active");

  const byId = new Map((products || []).map((p) => [p.id, p as ProductOut]));
  const out = ordered.map((id) => byId.get(id)).filter(Boolean).slice(0, 6);

  return Response.json({ products: out });
}
