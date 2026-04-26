import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import Link from "next/link";
import { createPublicClient } from "@/lib/supabase-server";
import { MerchProductCard, type ProductVariant } from "@/components/MerchProductCard";

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
  tier: string;
  title: string;
  description: string | null;
  price: number | null;
  image_url: string | null;
  image_alt: string | null;
  fulfillment: string;
  is_catalog_item: boolean;
  variants: ProductVariant[] | null;
}

export default async function MerchPage() {
  const supabase = createPublicClient();

  const { data: products } = await supabase
    .from("products")
    .select(
      "id, slug, tier, title, description, price, image_url, image_alt, fulfillment, is_catalog_item, source_observation_id, variants"
    )
    .in("fulfillment", ["manual", "printify_curated"])
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const { data: catalogPicks } = await supabase
    .from("products")
    .select(
      "id, slug, tier, title, description, price, image_url, image_alt, fulfillment, is_catalog_item, variants"
    )
    .eq("fulfillment", "printify_configurator")
    .eq("is_catalog_item", true)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const allProducts = [...((products || []) as ProductRow[]), ...((catalogPicks || []) as ProductRow[])];

  return (
    <div id="page-merch" className="page-merch">
      <header className="page-merch__header">
        <h1 className="page-merch__title">Citation Goes Physical</h1>
        <p className="page-merch__subtitle">
          The hoodie is a hyperlink made physical. When someone asks &ldquo;what
          does that mean?&rdquo;, the answer is a URL.
        </p>
      </header>

      {allProducts.length === 0 ? (
        <div className="page-merch__empty">
          <p>The shop is being stocked. Check back soon.</p>
        </div>
      ) : (
        <div className="merch-shop__grid">
          {allProducts.map((p) => {
            const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;
            if (hasVariants) {
              return (
                <MerchProductCard
                  key={p.id}
                  id={p.id}
                  slug={p.slug}
                  title={p.title}
                  description={p.description}
                  image_url={p.image_url}
                  image_alt={p.image_alt}
                  tier={p.tier}
                  variants={p.variants as ProductVariant[]}
                />
              );
            }
            return (
              <div key={p.id} className="merch-shop__card">
                {p.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.image_url}
                    alt={p.image_alt || p.title}
                    className="merch-shop__card-img"
                  />
                )}
                <div className="merch-shop__card-body">
                  <div className="merch-shop__card-meta">
                    <span className="merch-section__tier">{p.tier}</span>
                    {p.is_catalog_item && (
                      <span className="merch-shop__community-badge">
                        Community Pick
                      </span>
                    )}
                  </div>
                  <h3 className="merch-shop__card-title">{p.title}</h3>
                  {p.description && (
                    <p className="merch-shop__card-desc">{p.description}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Design Your Own */}
      <section className="merch-shop__configure-cta">
        <h2 className="configurator__heading">Design Your Own</h2>
        <p className="configurator__subtext">
          Pick any art or line from an Observation. Put it on a Comfort Colors
          1717. If it&rsquo;s good, it enters the permanent catalog &mdash; and
          you earn revenue share.
        </p>
        <Link href="/merch/configure" className="configurator__checkout-btn" style={{ display: "inline-block", textAlign: "center", textDecoration: "none", maxWidth: 280 }}>
          Open Configurator
        </Link>
      </section>
    </div>
  );
}
