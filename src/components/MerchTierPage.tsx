import { createPublicClient } from "@/lib/supabase-server";
import { CollectionJsonLd } from "@/components/CollectionJsonLd";
import Link from "next/link";

const TIER_META: Record<string, { label: string; description: string }> = {
  art: {
    label: "The Art",
    description: "Cover art from Observations — visual objects that carry the signal.",
  },
  line: {
    label: "The Line",
    description: "Sentences from Observations — text that travels on physical objects.",
  },
  fusion: {
    label: "The Fusion",
    description: "Art + Line combined — the full citation made physical.",
  },
  pick: {
    label: "The Pick",
    description: "Community-submitted designs — curated configurations from buyers who saw the product first.",
  },
};

export async function MerchTierPage({ tier }: { tier: string }) {
  const meta = TIER_META[tier];
  if (!meta) return null;

  const supabase = createPublicClient();
  const { data: products } = await supabase
    .from("products")
    .select("id, title, description, price, source_observation_id, is_catalog_item")
    .eq("tier", tier)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const items = (products || []).map((p) => ({
    name: p.title,
    url: `https://chadlewine.com/merch/${tier}#${p.id}`,
    price: p.price,
  }));

  return (
    <div className="page-merch-tier">
      <CollectionJsonLd
        name={`${meta.label} — Chad Lewine Merch`}
        description={meta.description}
        url={`https://chadlewine.com/merch/${tier}`}
        items={items}
      />

      <header className="page-merch-tier__header">
        <Link href="/merch" className="page-merch-tier__back">&larr; All Merch</Link>
        <h1 className="page-merch-tier__title">{meta.label}</h1>
        <p className="page-merch-tier__desc">{meta.description}</p>
      </header>

      {(!products || products.length === 0) ? (
        <div className="page-merch-tier__empty">
          <p>No products in this tier yet.</p>
          <Link href="/merch" className="page-merch-tier__cta">
            Open the configurator to create one
          </Link>
        </div>
      ) : (
        <div className="merch-section__grid">
          {products.map((p) => (
            <div key={p.id} id={p.id} className="merch-section__card">
              <span className="merch-section__tier">{tier}</span>
              <h3 className="merch-section__title">{p.title}</h3>
              {p.description && <p className="merch-section__desc">{p.description}</p>}
              {p.is_catalog_item && (
                <span className="merch-section__tier" style={{ marginTop: 4 }}>Community Pick</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
