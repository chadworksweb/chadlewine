import { createPublicClient } from "@/lib/supabase-server";
import { releaseTypeLabel } from "@/lib/release-labels";

/* Union of every priced, image-bearing, purchasable item across the catalog.
   Output shape matches ExploreGrid (key/id/slug/title/image_url/image_alt/
   href/kind) so the thank-you page can render the same water-ripple grid
   used elsewhere on the site.

   Selection: shuffle the merged pool and return the first `limit` items that
   aren't in `exclude`. The client passes the keys it has already shown so
   Load More always returns truly new items rather than the next-newest set.
   `next_cursor` is retained in the response shape for compatibility but is
   no longer used.
*/

const PER_PAGE_DEFAULT = 6;
const PER_KIND_OVERSHOOT = 100;

type Kind = "song" | "release" | "merch" | "art";

interface ExploreItem {
  key: string;
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  image_alt: string | null;
  href: string;
  kind: Kind;
  kind_label: string | null;
  sort_at: string;
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const excludeParam = url.searchParams.get("exclude") || "";
  const excludeSet = new Set(excludeParam.split(",").filter(Boolean));
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") || `${PER_PAGE_DEFAULT}`, 10), 1),
    36,
  );

  const supabase = createPublicClient();
  const items: ExploreItem[] = [];

  // Songs with a price.
  {
    const q = supabase
      .from("songs")
      .select("id, title, slug, price, art_image_path, art_alt, created_at")
      .not("art_image_path", "is", null)
      .gt("price", 0)
      .order("created_at", { ascending: false })
      .limit(PER_KIND_OVERSHOOT);
    const { data } = await q;
    for (const s of (data || []) as Array<{
      id: string; title: string; slug: string; price: number;
      art_image_path: string | null; art_alt: string | null; created_at: string;
    }>) {
      items.push({
        key: `song:${s.id}`,
        id: s.id,
        slug: s.slug,
        title: s.title,
        image_url: s.art_image_path,
        image_alt: s.art_alt || s.title,
        href: `/music/songs/${s.slug}`,
        kind: "song",
        kind_label: null,
        sort_at: s.created_at,
      });
    }
  }

  // Albums. Price now lives on release_skus, so pre-filter to releases
  // with at least one sellable priced SKU.
  {
    const { data: skuRows } = await supabase
      .from("release_skus")
      .select("release_id")
      .gt("price", 0)
      .in("status", ["available", "preorder"]);
    const sellableReleaseIds = Array.from(
      new Set((skuRows || []).map((r: { release_id: string }) => r.release_id)),
    );

    const q = supabase
      .from("releases")
      .select("id, title, slug, cover_art_path, cover_art_alt, release_type, created_at")
      .not("cover_art_path", "is", null)
      .in("id", sellableReleaseIds.length > 0 ? sellableReleaseIds : [""])
      .order("created_at", { ascending: false })
      .limit(PER_KIND_OVERSHOOT);
    const { data } = await q;
    for (const a of (data || []) as Array<{
      id: string; title: string; slug: string;
      cover_art_path: string | null; cover_art_alt: string | null;
      release_type: string | null; created_at: string;
    }>) {
      items.push({
        key: `album:${a.id}`,
        id: a.id,
        slug: a.slug,
        title: a.title,
        image_url: a.cover_art_path,
        image_alt: a.cover_art_alt || a.title,
        href: `/music/releases/${a.slug}`,
        kind: "release",
        kind_label: releaseTypeLabel(a.release_type) || null,
        sort_at: a.created_at,
      });
    }
  }

  // Products: priced merch + originals. variant_type='original' renders as kind='art'.
  {
    const q = supabase
      .from("merch")
      .select("id, title, slug, price, image_url, image_alt, variant_type, status, created_at")
      .eq("status", "active")
      .not("image_url", "is", null)
      .gt("price", 0)
      .order("created_at", { ascending: false })
      .limit(PER_KIND_OVERSHOOT);
    const { data } = await q;
    for (const p of (data || []) as Array<{
      id: string; title: string; slug: string | null; price: number;
      image_url: string | null; image_alt: string | null;
      variant_type: string | null; created_at: string;
    }>) {
      const isOriginal = p.variant_type === "original";
      items.push({
        key: `${isOriginal ? "art" : "merch"}:${p.id}`,
        id: p.id,
        slug: p.slug,
        title: p.title,
        image_url: p.image_url,
        image_alt: p.image_alt || p.title,
        href: p.slug ? `/merch/${p.slug}` : `/merch`,
        kind: isOriginal ? "art" : "merch",
        kind_label: null,
        sort_at: p.created_at,
      });
    }
  }

  // Drop anything the client has already shown, then shuffle the remaining
  // pool and take the page. has_more reports whether there are still fresh
  // items left after this slice — when it's false, the client hides the
  // Load More button.
  const fresh = items.filter((i) => !excludeSet.has(i.key));
  const shuffled = shuffle(fresh);
  const page = shuffled.slice(0, limit);
  const hasMore = shuffled.length > limit;

  return Response.json({
    items: page.map(({ sort_at, ...rest }) => ({ ...rest, sort_at })),
    next_cursor: null,
    has_more: hasMore,
  });
}
