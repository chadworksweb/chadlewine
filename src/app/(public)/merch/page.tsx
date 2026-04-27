import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
// import Link from "next/link"; // re-enable with the Design Your Own section below
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

export default async function MerchPage() {
  const supabase = createPublicClient();

  const { data: products } = await supabase
    .from("products")
    .select("id, slug, title, image_url, image_alt")
    .in("fulfillment", ["manual", "printify_curated"])
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const { data: catalogPicks } = await supabase
    .from("products")
    .select("id, slug, title, image_url, image_alt")
    .eq("fulfillment", "printify_configurator")
    .eq("is_catalog_item", true)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const allProducts = [...((products || []) as ProductRow[]), ...((catalogPicks || []) as ProductRow[])];

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

      {/* Design Your Own — hidden from public view; re-enable when configurator ships
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
      */}
    </div>
  );
}
