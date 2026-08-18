import { createPublicClient } from "@/lib/supabase-server";
import { resolveEntities, type EntityType, type EntityRef } from "@/lib/related-entities";
import "./YouMightAlsoLike.css";

interface Props {
  sourceType: EntityType;
  sourceId: string;
  heading?: string;
}

// Global "You Might Also Like" section. Reads the source's curated related
// entities (any mix of song/release/merch/art/observation) and renders unified
// cards. Drop on any post type's detail page.
export async function YouMightAlsoLike({ sourceType, sourceId, heading = "You might also like" }: Props) {
  const supabase = createPublicClient();

  const { data: rows } = await supabase
    .from("related_entities")
    .select("entity_type, entity_id, display_order")
    .eq("source_type", sourceType)
    .eq("source_id", sourceId)
    .order("display_order");

  const refs = ((rows || []) as EntityRef[]).map((r) => ({ entity_type: r.entity_type, entity_id: r.entity_id }));
  const items = await resolveEntities(supabase, refs);
  if (items.length === 0) return null;

  return (
    <section className="ymal" aria-labelledby="ymal-heading">
      <h2 className="ymal__heading" id="ymal-heading">{heading}</h2>
      <ul className="ymal__grid">
        {items.map((it) => (
          <li key={`${it.entity_type}:${it.id}`} className="ymal__card">
            <a href={it.href} className="ymal__link">
              <span className="ymal__thumb-wrap">
                {it.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.image} alt={it.alt || it.title} className="ymal__thumb" loading="lazy" />
                ) : (
                  <span className="ymal__thumb ymal__thumb--empty" />
                )}
              </span>
              <span className="ymal__title">{it.title}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
