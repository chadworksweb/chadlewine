import { createPublicClient } from "@/lib/supabase-server";
import { isSectionLive } from "@/lib/feature-flags";
import { MerchProductCard } from "@/components/MerchProductCard";

interface SongMerchSectionProps {
  songId: string;
}

interface ProductLite {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  image_alt: string | null;
}

function payloadIds(data_payload: unknown): string[] {
  const ids = (data_payload as { product_ids?: string[] } | null)?.product_ids;
  return Array.isArray(ids) ? ids : [];
}

// Surfaces merch on a song page from two sources, unioned and deduped:
//   1. The song's own "merch" visibility section (admin picks per song).
//   2. The merch section of any parent release the song belongs to -- so
//      release-level merch shows on every track automatically, no per-song
//      assignment needed.
// Song-specific picks are listed first; inherited release picks follow.
export async function SongMerchSection({ songId }: SongMerchSectionProps) {
  if (!(await isSectionLive("merch"))) return null;

  const supabase = createPublicClient();

  // Parent releases for this song.
  const { data: parentRows } = await supabase
    .from("release_songs")
    .select("release_id")
    .eq("song_id", songId);
  const releaseIds = (parentRows || []).map((r) => r.release_id);

  const [songSectionRes, releaseSectionsRes] = await Promise.all([
    supabase
      .from("song_visibility_sections")
      .select("data_payload")
      .eq("song_id", songId)
      .eq("category", "merch")
      .eq("status", "published")
      .maybeSingle(),
    releaseIds.length > 0
      ? supabase
          .from("release_visibility_sections")
          .select("data_payload")
          .in("release_id", releaseIds)
          .eq("category", "merch")
          .eq("status", "published")
      : Promise.resolve({ data: [] as { data_payload: unknown }[] }),
  ]);

  // Song picks first, then inherited release picks; dedupe preserves order.
  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (ids: string[]) => {
    for (const id of ids) {
      if (!seen.has(id)) { seen.add(id); ordered.push(id); }
    }
  };
  push(payloadIds(songSectionRes.data?.data_payload));
  for (const sec of (releaseSectionsRes.data || [])) push(payloadIds(sec.data_payload));

  if (ordered.length === 0) return null;

  const { data: products } = await supabase
    .from("products")
    .select("id, slug, title, image_url, image_alt")
    .in("id", ordered)
    .eq("status", "active");

  const byId = new Map((products || []).map((p) => [p.id, p as ProductLite]));
  const cards = ordered.map((id) => byId.get(id)).filter(Boolean) as ProductLite[];
  if (cards.length === 0) return null;

  return (
    <section className="merch-section" aria-labelledby="song-merch-heading">
      <h2 className="merch-section__heading" id="song-merch-heading">Merch</h2>
      <div className="merch-shop__grid">
        {cards.map((p) => (
          <MerchProductCard
            key={p.id}
            id={p.id}
            slug={p.slug}
            title={p.title}
            image_url={p.image_url}
            image_alt={p.image_alt}
          />
        ))}
      </div>
    </section>
  );
}
