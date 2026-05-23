import { createPublicClient } from "@/lib/supabase-server";
import { isSectionLive } from "@/lib/feature-flags";

interface MeditationMerchSectionProps {
  meditationId: string;
}

export async function MeditationMerchSection({
  meditationId,
}: MeditationMerchSectionProps) {
  if (!(await isSectionLive("merch"))) return null;

  const supabase = createPublicClient();

  const { data: products } = await supabase
    .from("products")
    .select("id, tier, title, description, price")
    .eq("source_meditation_id", meditationId)
    .eq("status", "active")
    .order("tier");

  if (!products || products.length === 0) return null;

  return (
    <section className="merch-section">
      <h2 className="merch-section__heading">Like what you just read?</h2>
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
