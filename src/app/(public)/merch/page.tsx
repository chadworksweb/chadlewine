import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient } from "@/lib/supabase-server";
import { AdminEditButton } from "@/components/AdminEditButton";
import { ExploreStrip } from "@/components/ExploreStrip";
import { MerchShopBrowser, type BrowserItem, type BrowserType } from "@/components/MerchShopBrowser";

const DEFAULT_METADATA: Metadata = {
  title: "Merch",
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

interface MerchTypeRow {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
}

// Joined merch row + (optional) release_sku.release.slug for the buy-flow
// redirect on physical_music cards.
interface ProductRow {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  image_alt: string | null;
  merch_type_id: string | null;
  price: number | null;
  created_at: string;
  display_order: number;
  is_new: boolean | null;
  release_sku_id: string | null;
  release_sku: {
    format: string | null;
    release: { slug: string; release_date: string | null } | null;
  } | null;
}

export default async function MerchPage() {
  const supabase = createPublicClient();

  const [productsRes, typesRes] = await Promise.all([
    supabase
      .from("merch")
      .select(
        "id, slug, title, image_url, image_alt, merch_type_id, price, created_at, display_order, is_new, release_sku_id, release_sku:release_skus(format, release:releases(slug, release_date))",
      )
      .in("fulfillment", ["manual", "printify_curated"])
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    supabase
      .from("merch_types")
      .select("id, slug, label, sort_order")
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true }),
  ]);

  // Backdrop art: pinned to the "Urgent Arbiter" digital piece. Lives in the
  // urgent-arbiter tee's gallery (position 1, source=custom) since there's no
  // standalone art_pieces row for this design.
  const backdropCovers = [
    "https://chadlewine-site-images.b-cdn.net/merch/urgent-arbiter-by-chad-lewine-tee/urgent-arbiter_digital-art-by-chad-lewine.webp",
  ];

  const allProducts = ((productsRes.data as unknown) as ProductRow[] | null) || [];
  const types = (typesRes.data || []) as MerchTypeRow[];

  const physicalMusicTypeId = types.find((t) => t.slug === "physical_music")?.id ?? null;
  const typeSlugById = new Map(types.map((t) => [t.id, t.slug]));

  const items: BrowserItem[] = allProducts.map((p) => {
    const isPhysicalMusic = p.merch_type_id === physicalMusicTypeId && physicalMusicTypeId !== null;
    const releaseSlug = p.release_sku?.release?.slug ?? null;
    const skuFormat = p.release_sku?.format ?? null;
    // physical_music cards link straight to the release page (with the format
    // pre-selected) so the existing release SKU buy flow handles the purchase.
    // Other types use the default /merch/[slug] product page.
    const href = isPhysicalMusic && releaseSlug
      ? `/music/releases/${releaseSlug}${skuFormat ? `?format=${skuFormat}` : ""}`
      : undefined;
    // Physical music sorts by the release date for a musician's mental model;
    // everything else uses merch row created_at.
    const releaseDate = p.release_sku?.release?.release_date ?? null;
    const created = isPhysicalMusic && releaseDate ? releaseDate : p.created_at;
    return {
      key: `merch-${p.id}`,
      id: p.id,
      slug: p.slug,
      title: p.title,
      image_url: p.image_url,
      image_alt: p.image_alt,
      href,
      type_id: p.merch_type_id,
      type_slug: p.merch_type_id ? typeSlugById.get(p.merch_type_id) || null : null,
      created_at: created,
      price: p.price === null ? null : Number(p.price),
      display_order: p.display_order ?? 0,
      is_new: !!p.is_new,
    };
  });

  const browserTypes: BrowserType[] = types.map((t) => ({
    id: t.id,
    slug: t.slug,
    label: t.label,
    sort_order: t.sort_order,
  }));

  return (
    <div id="page-merch" className="page-merch">
      <AdminEditButton href="/admin/merch" />
      <header className="page-merch__header">
        <h1 className="page-merch__title">Merchandise</h1>
      </header>

      <MerchShopBrowser items={items} types={browserTypes} backdropCovers={backdropCovers} />

      <ExploreStrip excludeMerchIds={allProducts.map((p) => p.id)} />
    </div>
  );
}
