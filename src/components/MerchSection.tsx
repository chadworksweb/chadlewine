import { createPublicClient } from "@/lib/supabase-server";
import Link from "next/link";

interface MerchSectionProps {
  observationId: string;
}

export async function MerchSection({ observationId }: MerchSectionProps) {
  const supabase = createPublicClient();

  const [{ data: products }, { data: observation }] = await Promise.all([
    supabase
      .from("products")
      .select("id, tier, title, description, price")
      .eq("source_observation_id", observationId)
      .eq("status", "active")
      .order("tier"),
    supabase
      .from("observations")
      .select("id, title, hook_line, merch_lines, merch_enabled, art_image_path")
      .eq("id", observationId)
      .single(),
  ]);

  const hasProducts = products && products.length > 0;
  const hasPickLines =
    observation?.merch_enabled &&
    ((observation.merch_lines && observation.merch_lines.length > 0) || observation.hook_line);

  if (!hasProducts && !hasPickLines) return null;

  const pickLines: string[] = [];
  if (observation?.hook_line) pickLines.push(observation.hook_line);
  if (observation?.merch_lines) pickLines.push(...observation.merch_lines);

  return (
    <section className="merch-section">
      <h2 className="merch-section__heading">Like what you just read?</h2>

      {/* Existing products */}
      {hasProducts && (
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
      )}

      {/* The Pick — selectable lines */}
      {hasPickLines && (
        <div className="merch-pick">
          <h3 className="merch-pick__heading">The Pick</h3>
          <p className="merch-pick__desc">
            Put it on a shirt. Or a mug. Or anything.
          </p>
          <div className="merch-pick__lines">
            {pickLines.map((line, i) => (
              <Link
                key={i}
                href={`/merch/configure?tier=line&line=${encodeURIComponent(line)}&obs=${encodeURIComponent(observation.id)}`}
                className="merch-pick__line"
              >
                <span className="merch-pick__line-text">&ldquo;{line}&rdquo;</span>
                <span className="merch-pick__line-cta">Configure &rarr;</span>
              </Link>
            ))}
          </div>
          {observation.art_image_path && (
            <Link
              href={`/merch/configure?tier=art&obs=${encodeURIComponent(observation.id)}`}
              className="merch-pick__art-link"
            >
              Put the art on something &rarr;
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
