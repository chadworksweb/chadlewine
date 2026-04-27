import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient } from "@/lib/supabase-server";
import { MerchProductCard } from "@/components/MerchProductCard";

const DEFAULT_METADATA: Metadata = {
  title: "Merch — Chad Lewine",
  description:
    "Citation goes physical. The hoodie is a hyperlink made physical.",
  alternates: { canonical: "https://chadlewine.com/merch" },
  openGraph: {
    title: "Merch — Chad Lewine",
    description:
      "Citation goes physical. The hoodie is a hyperlink made physical.",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/merch", DEFAULT_METADATA);
}

export const revalidate = 60;

interface ProductRow {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  image_alt: string | null;
}

interface ExploreItem {
  key: string;
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  image_alt: string | null;
  href: string;
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pickN<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n);
}

export default async function MerchPage() {
  const supabase = createPublicClient();

  const [productsRes, catalogPicksRes, songsRes, albumsRes, artRes] = await Promise.all([
    supabase
      .from("products")
      .select("id, slug, title, image_url, image_alt")
      .in("fulfillment", ["manual", "printify_curated"])
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    supabase
      .from("products")
      .select("id, slug, title, image_url, image_alt")
      .eq("fulfillment", "printify_configurator")
      .eq("is_catalog_item", true)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    supabase
      .from("songs")
      .select("id, slug, title, art_image_path")
      .eq("status", "published")
      .not("art_image_path", "is", null)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("albums")
      .select("id, slug, title, cover_art_path")
      .eq("status", "published")
      .not("cover_art_path", "is", null)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("art_pieces")
      .select("id, slug, title, image_path")
      .in("status", ["unreleased", "published"])
      .not("image_path", "is", null)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  const allProducts = [
    ...((productsRes.data || []) as ProductRow[]),
    ...((catalogPicksRes.data || []) as ProductRow[]),
  ];

  const shownMerchIds = new Set(allProducts.map((p) => p.id));

  const merchPool: ExploreItem[] = allProducts
    .filter((p) => p.image_url)
    .map((p) => ({
      key: `merch:${p.id}`,
      id: p.id,
      slug: p.slug,
      title: p.title,
      image_url: p.image_url,
      image_alt: p.image_alt,
      href: `/merch/${p.slug || p.id}`,
    }));

  const songPool: ExploreItem[] = ((songsRes.data || []) as Array<{ id: string; slug: string; title: string; art_image_path: string | null }>).map((s) => ({
    key: `song:${s.id}`,
    id: s.id,
    slug: s.slug,
    title: s.title,
    image_url: s.art_image_path,
    image_alt: s.title,
    href: `/music/songs/${s.slug}`,
  }));

  const albumPool: ExploreItem[] = ((albumsRes.data || []) as Array<{ id: string; slug: string; title: string; cover_art_path: string | null }>).map((a) => ({
    key: `album:${a.id}`,
    id: a.id,
    slug: a.slug,
    title: a.title,
    image_url: a.cover_art_path,
    image_alt: a.title,
    href: `/music/albums/${a.slug}`,
  }));

  const artPool: ExploreItem[] = ((artRes.data || []) as Array<{ id: string; slug: string; title: string; image_path: string | null }>).map((a) => ({
    key: `art:${a.id}`,
    id: a.id,
    slug: a.slug,
    title: a.title,
    image_url: a.image_path,
    image_alt: a.title,
    href: `/art/${a.slug}`,
  }));

  // Pick 2 from each pool to guarantee all four types are represented when
  // available, then shuffle the resulting 8 so the row isn't grouped by type.
  // Also exclude merch already shown in the main grid above (when there's
  // enough other merch to spare; otherwise allow duplicates rather than show
  // empty slots).
  const merchExtras = merchPool.filter((m) => !shownMerchIds.has(m.id));
  const explore = shuffle([
    ...pickN(merchExtras.length >= 2 ? merchExtras : merchPool, 2),
    ...pickN(songPool, 2),
    ...pickN(albumPool, 2),
    ...pickN(artPool, 2),
  ]);

  return (
    <div id="page-merch" className="page-merch">
      <header className="page-merch__header">
        <h1 className="page-merch__title">Merchandise</h1>
      </header>

      {allProducts.length === 0 ? (
        <div className="page-merch__empty">
          <p>The shop is being stocked. Check back soon.</p>
        </div>
      ) : (
        <div className="merch-shop__grid">
          {allProducts.map((p) => (
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
      )}

      {explore.length > 0 && (
        <section className="page-merch__explore">
          <div className="page-merch__explore-frame">
            <span className="page-merch__explore-frame-label" aria-hidden="true">░▒▓█</span>
            <h2 className="page-merch__explore-heading">Explore</h2>
            <span className="page-merch__explore-frame-label" aria-hidden="true">█▓▒░</span>
          </div>
          <div className="page-merch__explore-grid">
            {explore.map((item) => (
              <MerchProductCard
                key={item.key}
                id={item.id}
                slug={item.slug}
                title={item.title}
                image_url={item.image_url}
                image_alt={item.image_alt}
                href={item.href}
              />
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
