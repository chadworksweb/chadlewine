import { createPublicClient } from "@/lib/supabase-server";
import { MerchProductCard } from "@/components/MerchProductCard";

interface ExploreItem {
  key: string;
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  image_alt: string | null;
  href: string;
}

interface ProductRow {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  image_alt: string | null;
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

interface Props {
  /** Merch product IDs to exclude from the strip (e.g. items already shown on the page). */
  excludeMerchIds?: string[];
  /** When true, wrap in a `.page-merch` container so the strip can stand alone outside the merch index. */
  standalone?: boolean;
}

export async function MerchExplore({ excludeMerchIds = [], standalone = false }: Props) {
  const supabase = createPublicClient();
  const excludeSet = new Set(excludeMerchIds);

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

  const merchPool: ExploreItem[] = allProducts
    .filter((p) => p.image_url && !excludeSet.has(p.id))
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
  const explore = shuffle([
    ...pickN(merchPool, 2),
    ...pickN(songPool, 2),
    ...pickN(albumPool, 2),
    ...pickN(artPool, 2),
  ]);

  if (explore.length === 0) return null;

  const strip = (
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
  );

  if (standalone) {
    return <div className="page-merch">{strip}</div>;
  }

  return strip;
}
