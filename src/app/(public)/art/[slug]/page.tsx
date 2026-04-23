import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createPublicClient } from "@/lib/supabase-server";
import { AdminEditButton } from "@/components/AdminEditButton";
import { ArtBuyPanel } from "@/components/ArtBuyPanel";
import { ArtPieceJsonLd } from "@/components/ArtPieceJsonLd";
import { focalCropStyle } from "@/lib/focal-crop";

export const revalidate = 60;

type ArtRow = {
  id: string;
  slug: string;
  title: string;
  image_path: string;
  image_alt: string | null;
  medium: string | null;
  dimensions: string | null;
  year_created: number | null;
  art_summary: string | null;
  description: string | null;
  chad_quote: string | null;
  hero_focal_x: number | null;
  hero_focal_y: number | null;
  hero_zoom: number | null;
  focus_keyphrase: string | null;
  secondary_keyphrases: string[] | null;
  citation_summary: string | null;
  paa_pairs: { question: string; answer: string }[] | null;
  entity_tags: string[] | null;
  seo_title: string | null;
  seo_description: string | null;
  status: string;
};

type ProductRow = {
  id: string;
  title: string;
  price: number | null;
  variant_type: string | null;
  variant_label: string | null;
  edition_size: number;
  editions_sold: number;
};

type PairedSong = {
  id: string;
  slug: string;
  title: string;
  art_image_path: string | null;
  art_alt: string | null;
  card_focal_x: number | null;
  card_focal_y: number | null;
  card_zoom: number | null;
  song_summary: string | null;
};

type PairedArt = {
  id: string;
  slug: string;
  title: string;
  image_path: string;
  image_alt: string | null;
  card_focal_x: number | null;
  card_focal_y: number | null;
  card_zoom: number | null;
  art_summary: string | null;
};

async function getArtData(slug: string) {
  const supabase = createPublicClient();
  const { data: art } = await supabase
    .from("art_pieces")
    .select("*")
    .eq("slug", slug)
    .in("status", ["unreleased", "published"])
    .single();
  if (!art) return null;

  const { data: products } = await supabase
    .from("products")
    .select("id, title, price, variant_type, variant_label, edition_size, editions_sold")
    .eq("source_art_id", art.id)
    .eq("status", "active");

  const { data: composition } = await supabase
    .from("art_composition")
    .select("content_html")
    .eq("art_id", art.id)
    .eq("status", "published")
    .maybeSingle();

  const { data: featuredSongs } = await supabase
    .from("art_featured_songs")
    .select("position, song:songs(id, slug, title, art_image_path, art_alt, card_focal_x, card_focal_y, card_zoom, song_summary, status)")
    .eq("art_id", art.id)
    .order("position");

  const pairedSongs: PairedSong[] = ((featuredSongs as { song: PairedSong & { status: string } | null }[] | null) || [])
    .map((p) => p.song)
    .filter((s): s is PairedSong & { status: string } => !!s && (s.status === "published" || s.status === "unreleased"));

  const { data: featuredArt } = await supabase
    .from("art_featured_art")
    .select("position, art:art_pieces!art_featured_art_related_art_id_fkey(id, slug, title, image_path, image_alt, card_focal_x, card_focal_y, card_zoom, art_summary, status)")
    .eq("parent_art_id", art.id)
    .order("position");

  const pairedArt: PairedArt[] = ((featuredArt as { art: (PairedArt & { status: string }) | null }[] | null) || [])
    .map((p) => p.art)
    .filter((a): a is PairedArt & { status: string } => !!a && (a.status === "published" || a.status === "unreleased"));

  return {
    art: art as ArtRow,
    products: (products as ProductRow[] | null) || [],
    compositionHtml: composition?.content_html || null,
    pairedSongs,
    pairedArt,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await getArtData(slug);
  if (!data) return {};
  const { art } = data;
  const title = art.seo_title || `${art.title} — Art — Chad Lewine`;
  const description =
    art.seo_description ||
    art.citation_summary ||
    art.art_summary ||
    `${art.title} by Chad Lewine.`;
  return {
    title,
    description,
    alternates: { canonical: `https://chadlewine.com/art/${slug}` },
    openGraph: {
      type: "article",
      title,
      description,
      url: `https://chadlewine.com/art/${slug}`,
      images: [{ url: art.image_path, alt: art.image_alt || art.title }],
    },
  };
}

export default async function ArtDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getArtData(slug);
  if (!data) notFound();
  const { art, products, compositionHtml, pairedSongs, pairedArt } = data;

  const metaParts = [art.medium, art.dimensions, art.year_created ? String(art.year_created) : null].filter(Boolean) as string[];

  return (
    <>
      <ArtPieceJsonLd
        title={art.title}
        url={`https://chadlewine.com/art/${art.slug}`}
        image={art.image_path}
        imageAlt={art.image_alt}
        artSummary={art.art_summary}
        description={art.description}
        citationSummary={art.citation_summary}
        medium={art.medium}
        dimensions={art.dimensions}
        yearCreated={art.year_created}
        focusKeyphrase={art.focus_keyphrase}
        secondaryKeyphrases={art.secondary_keyphrases || []}
        paaPairs={art.paa_pairs || []}
      />
      <AdminEditButton href={`/admin/art/${art.slug}`} />
      <article className="art-detail">
        <div className="art-detail__hero">
          <img
            src={art.image_path}
            alt={art.image_alt || art.title}
            className="art-detail__hero-img"
            style={focalCropStyle(art.hero_focal_x, art.hero_focal_y, art.hero_zoom)}
          />
        </div>

        <div className="art-detail__body">
          <h1 className="art-detail__title">{art.title}</h1>
          {metaParts.length > 0 && (
            <div className="art-detail__meta">
              {metaParts.map((m, i) => <span key={i}>{m}</span>)}
            </div>
          )}

          {art.art_summary && <p className="art-detail__summary">{art.art_summary}</p>}

          <ArtBuyPanel products={products} artTitle={art.title} />

          {art.chad_quote && (
            <blockquote className="art-detail__quote">
              <p>{art.chad_quote}</p>
              <cite>— Chad</cite>
            </blockquote>
          )}

          {art.description && (
            <section className="art-detail__section">
              <h2>About</h2>
              <p>{art.description}</p>
            </section>
          )}

          {compositionHtml && (
            <section className="art-detail__section">
              <h2>Making of</h2>
              <div dangerouslySetInnerHTML={{ __html: compositionHtml }} />
            </section>
          )}

          {pairedSongs.length > 0 && (
            <section className="art-detail__section art-detail__pairings">
              <h2>Songs you might like</h2>
              <div className="art-detail__pairings-grid">
                {pairedSongs.map((s) => (
                  <Link key={s.id} href={`/music/songs/${s.slug}`} className="art-pairing-card">
                    {s.art_image_path && (
                      <img
                        src={s.art_image_path}
                        alt={s.art_alt || s.title}
                        className="art-pairing-card__img"
                        style={focalCropStyle(s.card_focal_x, s.card_focal_y, s.card_zoom)}
                      />
                    )}
                    <div className="art-pairing-card__body">
                      <h3 className="art-pairing-card__title">{s.title}</h3>
                      {s.song_summary && <p className="art-pairing-card__summary">{s.song_summary}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {pairedArt.length > 0 && (
            <section className="art-detail__section art-detail__pairings">
              <h2>Other art you might like</h2>
              <div className="art-detail__pairings-grid">
                {pairedArt.map((a) => (
                  <Link key={a.id} href={`/art/${a.slug}`} className="art-pairing-card">
                    <img
                      src={a.image_path}
                      alt={a.image_alt || a.title}
                      className="art-pairing-card__img"
                      style={focalCropStyle(a.card_focal_x, a.card_focal_y, a.card_zoom)}
                    />
                    <div className="art-pairing-card__body">
                      <h3 className="art-pairing-card__title">{a.title}</h3>
                      {a.art_summary && <p className="art-pairing-card__summary">{a.art_summary}</p>}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {art.paa_pairs && art.paa_pairs.length > 0 && (
            <section className="art-detail__section art-detail__faq">
              <h2>Questions</h2>
              {art.paa_pairs.map((p, i) => (
                <div key={i} className="art-detail__faq-item">
                  <h3>{p.question}</h3>
                  <p>{p.answer}</p>
                </div>
              ))}
            </section>
          )}
        </div>
      </article>
    </>
  );
}
