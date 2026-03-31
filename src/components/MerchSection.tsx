import { createPublicClient } from "@/lib/supabase-server";

interface MerchSectionProps {
  observationId: string;
}

export async function MerchSection({ observationId }: MerchSectionProps) {
  const supabase = createPublicClient();
  const { data: products } = await supabase
    .from("products")
    .select("id, tier, title, description, price")
    .eq("source_observation_id", observationId)
    .eq("status", "active")
    .order("tier");

  if (!products || products.length === 0) return null;

  return (
    <section className="merch-section">
      <h2 className="merch-section__heading">Merch</h2>
      <div className="merch-section__grid">
        {products.map((p) => (
          <div key={p.id} className="merch-section__card">
            <span className="merch-section__tier">{p.tier}</span>
            <h3 className="merch-section__title">{p.title}</h3>
            {p.description && (
              <p className="merch-section__desc">{p.description}</p>
            )}
            {p.price && (
              <span className="merch-section__price">
                ${Number(p.price).toFixed(2)}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
