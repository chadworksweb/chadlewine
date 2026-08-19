import { createPublicClient } from "@/lib/supabase-server";
import { ExploreGrid, type ExploreKind } from "@/components/ExploreGrid";

interface ExploreItem {
  key: string;
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  image_alt: string | null;
  href: string;
  kind: ExploreKind;
  is_new?: boolean | null;
}

interface ProductRow {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  image_alt: string | null;
  is_new: boolean | null;
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
  /** When true, wrap in a width-constrained container so the strip can stand alone outside an existing page container. */
  wrap?: boolean;
}

export async function ExploreStrip({ excludeMerchIds = [], wrap = false }: Props) {
  const supabase = createPublicClient();
  const excludeSet = new Set(excludeMerchIds);

  const [productsRes, songsRes, albumsRes, artRes] = await Promise.all([
    supabase
      .from("merch")
      .select("id, slug, title, image_url, image_alt, is_new")
      .in("fulfillment", ["manual", "printify_curated"])
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
      .from("releases")
      .select("id, slug, title, cover_art_path")
      .eq("status", "published")
      .neq("release_type", "single")
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

  const allProducts = (productsRes.data || []) as ProductRow[];

  const allMerchPool: ExploreItem[] = allProducts
    .filter((p) => p.image_url)
    .map((p) => ({
      key: `merch:${p.id}`,
      id: p.id,
      slug: p.slug,
      title: p.title,
      image_url: p.image_url,
      image_alt: p.image_alt,
      href: `/merch/${p.slug || p.id}`,
      kind: "merch",
      is_new: p.is_new,
    }));
  // Prefer merch not already shown on the page. If after exclusion we have
  // fewer than 2 left (e.g. the merch index already shows every product in
  // its main grid), fall back to the full pool so the strip still gets a
  // merch tile or two — better duplicates than an empty slot.
  const merchExtras = allMerchPool.filter((m) => !excludeSet.has(m.id));
  const merchPool = merchExtras.length >= 2 ? merchExtras : allMerchPool;

  const songPool: ExploreItem[] = ((songsRes.data || []) as Array<{ id: string; slug: string; title: string; art_image_path: string | null }>).map((s) => ({
    key: `song:${s.id}`,
    id: s.id,
    slug: s.slug,
    title: s.title,
    image_url: s.art_image_path,
    image_alt: s.title,
    href: `/music/songs/${s.slug}`,
    kind: "song",
  }));

  const albumPool: ExploreItem[] = ((albumsRes.data || []) as Array<{ id: string; slug: string; title: string; cover_art_path: string | null }>).map((a) => ({
    key: `album:${a.id}`,
    id: a.id,
    slug: a.slug,
    title: a.title,
    image_url: a.cover_art_path,
    image_alt: a.title,
    href: `/music/releases/${a.slug}`,
    kind: "release",
  }));

  const artPool: ExploreItem[] = ((artRes.data || []) as Array<{ id: string; slug: string; title: string; image_path: string | null }>).map((a) => ({
    key: `art:${a.id}`,
    id: a.id,
    slug: a.slug,
    title: a.title,
    image_url: a.image_path,
    image_alt: a.title,
    href: `/art/${a.slug}`,
    kind: "art",
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
    <section className="explore-strip">
      <div className="explore-strip__frame">
        <span className="explore-strip__frame-label" aria-hidden="true">░▒▓█</span>
        <h2 className="explore-strip__heading">Explore</h2>
        <span className="explore-strip__frame-label" aria-hidden="true">█▓▒░</span>
      </div>
      <ExploreGrid items={explore} />
    </section>
  );

  if (wrap) {
    return <div className="explore-strip__wrap">{strip}</div>;
  }

  return strip;
}
