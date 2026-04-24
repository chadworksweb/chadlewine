import { createPublicClient } from "@/lib/supabase-server";

interface DiddySectionProps {
  observationId: string;
}

interface DiddyProduct {
  id: string;
  title: string;
  description: string | null;
  price: number | null;
  printify_product_id: string | null;
}

export async function DiddySection({ observationId }: DiddySectionProps) {
  const supabase = createPublicClient();

  const { data: diddy } = await supabase
    .from("products")
    .select("id, title, description, price, printify_product_id")
    .eq("source_observation_id", observationId)
    .eq("tier", "diddy")
    .eq("status", "active")
    .single();

  if (!diddy) return null;

  return (
    <section className="diddy-section">
      <div className="diddy-section__header">
        <h2 className="diddy-section__heading">The Diddy</h2>
        <span className="diddy-section__duration">0:31</span>
      </div>
      <p className="diddy-section__title">{diddy.title}</p>
      {diddy.description && (
        <p className="diddy-section__desc">{diddy.description}</p>
      )}
      <div className="diddy-section__actions">
        <DiddyBuyButton productId={diddy.id} format="mp3" price={diddy.price} />
        <DiddyBuyButton productId={diddy.id} format="wav" price={diddy.price ? diddy.price + 1 : null} />
        <DiddyBuyButton productId={diddy.id} format="ringtone" price={diddy.price ? Math.round((diddy.price * 0.75) * 100) / 100 : null} />
      </div>
    </section>
  );
}

function DiddyBuyButton({
  productId,
  format,
  price,
}: {
  productId: string;
  format: "mp3" | "wav" | "ringtone";
  price: number | null;
}) {
  const labels: Record<string, string> = {
    mp3: "MP3",
    wav: "WAV",
    ringtone: "Ringtone",
  };

  if (!price) return null;

  return (
    <form action="/api/diddy-checkout" method="POST">
      <input type="hidden" name="product_id" value={productId} />
      <input type="hidden" name="format" value={format} />
      <button type="submit" className="diddy-section__buy-btn">
        <span className="diddy-section__buy-format">{labels[format]}</span>
      </button>
    </form>
  );
}
