import { createPublicClient } from "@/lib/supabase-server";

/* Union of every priced, image-bearing, purchasable item across the catalog.
   Output shape matches ExploreGrid (key/id/slug/title/image_url/image_alt/
   href/kind) so the thank-you page can render the same water-ripple grid
   used elsewhere on the site.

   Pagination: each kind queries the latest N (created_at desc) older than
   the cursor, then we merge across kinds by created_at desc and trim to
   the page limit.
*/

const PER_PAGE_DEFAULT = 6;
const PER_KIND_OVERSHOOT = 30;

type Kind = "song" | "album" | "merch" | "art";

interface ExploreItem {
  key: string;
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  image_alt: string | null;
  href: string;
  kind: Kind;
  sort_at: string;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") || null;
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") || `${PER_PAGE_DEFAULT}`, 10), 1),
    36,
  );

  const supabase = createPublicClient();
  const items: ExploreItem[] = [];

  // Songs with a price.
  {
    let q = supabase
      .from("songs")
      .select("id, title, slug, price, art_image_path, art_alt, created_at")
      .not("art_image_path", "is", null)
      .gt("price", 0)
      .order("created_at", { ascending: false })
      .limit(PER_KIND_OVERSHOOT);
    if (cursor) q = q.lt("created_at", cursor);
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
        sort_at: s.created_at,
      });
    }
  }

  // Albums.
  {
    let q = supabase
      .from("albums")
      .select("id, title, slug, price, cover_art_path, cover_art_alt, created_at")
      .not("cover_art_path", "is", null)
      .gt("price", 0)
      .order("created_at", { ascending: false })
      .limit(PER_KIND_OVERSHOOT);
    if (cursor) q = q.lt("created_at", cursor);
    const { data } = await q;
    for (const a of (data || []) as Array<{
      id: string; title: string; slug: string; price: number;
      cover_art_path: string | null; cover_art_alt: string | null; created_at: string;
    }>) {
      items.push({
        key: `album:${a.id}`,
        id: a.id,
        slug: a.slug,
        title: a.title,
        image_url: a.cover_art_path,
        image_alt: a.cover_art_alt || a.title,
        href: `/music/albums/${a.slug}`,
        kind: "album",
        sort_at: a.created_at,
      });
    }
  }

  // Products: priced merch + originals. variant_type='original' renders as kind='art'.
  {
    let q = supabase
      .from("products")
      .select("id, title, slug, price, image_url, image_alt, variant_type, status, created_at")
      .eq("status", "active")
      .not("image_url", "is", null)
      .gt("price", 0)
      .order("created_at", { ascending: false })
      .limit(PER_KIND_OVERSHOOT);
    if (cursor) q = q.lt("created_at", cursor);
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
        sort_at: p.created_at,
      });
    }
  }

  // Sort merged by created_at desc, trim to page, expose next cursor.
  items.sort((a, b) => (a.sort_at < b.sort_at ? 1 : -1));
  const page = items.slice(0, limit);
  const nextCursor = page.length > 0 ? page[page.length - 1].sort_at : null;
  const hasMore = items.length > limit;

  return Response.json({
    items: page.map(({ sort_at, ...rest }) => ({ ...rest, sort_at })),
    next_cursor: hasMore ? nextCursor : null,
    has_more: hasMore,
  });
}
