import { createPublicClient } from "@/lib/supabase-server";
import type { HeroLensItem } from "@/components/HeroLens";

// Bespoke, one-off homepage hero slide for the Don't Blame Me pre-order.
// The image + focal point come from the release row (so tweaking the album's
// hero crop in admin flows straight through), but the copy is fixed campaign
// text. The slide self-retires: it only renders while the release still has a
// pre-order SKU, so the moment the album drops and that SKU flips off, the
// slide disappears with no code change.
const PREORDER_RELEASE_SLUG = "dont-blame-me";
const PREORDER_SUBHEAD = "Summer 2026";
const PREORDER_BADGE = "Album";
const PREORDER_CTA = "Pre-order Now →";

interface ReleaseRow {
  id: string;
  slug: string;
  title: string;
  cover_art_path: string | null;
  cover_art_alt: string | null;
  hero_focal_x: number | null;
  hero_focal_y: number | null;
  hero_zoom: number | null;
}

export async function getPreorderHeroSlide(): Promise<HeroLensItem | null> {
  const supabase = createPublicClient();

  const { data: release } = await supabase
    .from("releases")
    .select("id, slug, title, cover_art_path, cover_art_alt, hero_focal_x, hero_focal_y, hero_zoom")
    .eq("slug", PREORDER_RELEASE_SLUG)
    .maybeSingle<ReleaseRow>();

  if (!release || !release.cover_art_path) return null;

  // Only show while a pre-order SKU is live.
  const { data: sku } = await supabase
    .from("release_skus")
    .select("id")
    .eq("release_id", release.id)
    .eq("status", "preorder")
    .limit(1)
    .maybeSingle();

  if (!sku) return null;

  const fx = release.hero_focal_x;
  const fy = release.hero_focal_y;
  const fz = release.hero_zoom;

  return {
    slug: release.slug,
    title: release.title,
    date: null,
    artImagePath: release.cover_art_path,
    artAlt: release.cover_art_alt || release.title,
    href: `/music/releases/${release.slug}`,
    ctaLabel: PREORDER_CTA,
    focalX: fx != null ? fx / 100 : 0.5,
    focalY: fy != null ? fy / 100 : 0.5,
    zoom: fz != null && fz >= 1 ? fz : 1,
    kind: "preorder",
    badgeLabel: PREORDER_BADGE,
    subhead: PREORDER_SUBHEAD,
  };
}
