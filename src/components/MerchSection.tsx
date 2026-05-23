import { createPublicClient } from "@/lib/supabase-server";
import { isSectionLive } from "@/lib/feature-flags";

interface MerchSectionProps {
  observationId: string;
}

export async function MerchSection({ observationId }: MerchSectionProps) {
  if (!(await isSectionLive("merch"))) return null;

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
      <div className="merch-section__grid">
        {products.map((p) => (
          <div key={p.id} className="merch-section__card">
            <h3 className="merch-section__title">{p.title}</h3>
            {p.description && (
              <p className="merch-section__desc">{p.description}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
