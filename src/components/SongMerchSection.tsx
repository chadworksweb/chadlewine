import { createPublicClient } from "@/lib/supabase-server";
import Link from "next/link";

interface SongMerchSectionProps {
  songId: string;
}

export async function SongMerchSection({ songId }: SongMerchSectionProps) {
  const supabase = createPublicClient();

  const [{ data: products }, { data: song }] = await Promise.all([
    supabase
      .from("products")
      .select("id, tier, title, description, price")
      .eq("source_song_id", songId)
      .eq("status", "active")
      .order("tier"),
    supabase
      .from("songs")
      .select("id, title, hook_line, merch_lines, merch_enabled, art_image_path")
      .eq("id", songId)
      .single(),
  ]);

  const hasProducts = products && products.length > 0;
  const hasPickLines =
    song?.merch_enabled &&
    ((song.merch_lines && song.merch_lines.length > 0) || song.hook_line);

  if (!hasProducts && !hasPickLines) return null;

  const pickLines: string[] = [];
  if (song?.hook_line) pickLines.push(song.hook_line);
  if (song?.merch_lines) pickLines.push(...song.merch_lines);

  return (
    <section className="merch-section">
      <h2 className="merch-section__heading">Like what you just heard?</h2>

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
                href={`/merch/configure?tier=line&source=song&song=${encodeURIComponent(song.id)}&line=${encodeURIComponent(line)}`}
                className="merch-pick__line"
              >
                <span className="merch-pick__line-text">&ldquo;{line}&rdquo;</span>
                <span className="merch-pick__line-cta">Configure &rarr;</span>
              </Link>
            ))}
          </div>
          {song.art_image_path && (
            <Link
              href={`/merch/configure?tier=art&source=song&song=${encodeURIComponent(song.id)}`}
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
