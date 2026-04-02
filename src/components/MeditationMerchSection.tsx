import { createPublicClient } from "@/lib/supabase-server";
import Link from "next/link";

interface MeditationMerchSectionProps {
  meditationId: string;
  meditationText: string;
}

export async function MeditationMerchSection({
  meditationId,
  meditationText,
}: MeditationMerchSectionProps) {
  const supabase = createPublicClient();

  // Check for Line-tier products linked to this meditation
  const { data: products } = await supabase
    .from("products")
    .select("id, tier, title, description, price")
    .eq("source_meditation_id", meditationId)
    .eq("status", "active")
    .order("tier");

  const hasProducts = products && products.length > 0;

  return (
    <section className="merch-section">
      <h2 className="merch-section__heading">Carry this line</h2>
      {hasProducts ? (
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
      ) : (
        <p className="merch-section__desc">
          Put this meditation on anything.{" "}
          <Link href="/merch/configure" style={{ color: "var(--text-accent)" }}>
            Open the configurator
          </Link>
        </p>
      )}
    </section>
  );
}
