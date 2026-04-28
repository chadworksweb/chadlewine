import { createPublicClient } from "@/lib/supabase-server";
import { isSectionLive } from "@/lib/feature-flags";

interface SongMerchSectionProps {
  songId: string;
}

export async function SongMerchSection({ songId }: SongMerchSectionProps) {
  if (!(await isSectionLive("merch"))) return null;

  const supabase = createPublicClient();

  const { data: products } = await supabase
    .from("products")
    .select("id, tier, title, description, price")
    .eq("source_song_id", songId)
    .eq("status", "active")
    .order("tier");

  if (!products || products.length === 0) return null;

  return (
    <section className="merch-section">
      <div className="merch-section__grid">
        {products.map((p) => (
          <div key={p.id} className="merch-section__card">
            <span className="merch-section__tier">{p.tier}</span>
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
