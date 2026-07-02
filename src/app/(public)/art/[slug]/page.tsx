import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Image from "next/image";
import { createPublicClient } from "@/lib/supabase-server";
import { AdminEditButton } from "@/components/AdminEditButton";
import { ArtBuyPanel } from "@/components/ArtBuyPanel";
import { ArtSkuBuyPanel, type ArtSku } from "@/components/ArtSkuBuyPanel";
import { ArtFramedHero } from "@/components/ArtFramedHero";
import { RoomView, type RoomScene } from "@/components/RoomView";
import { ArtPieceJsonLd } from "@/components/ArtPieceJsonLd";
import { ArtProductJsonLd } from "@/components/ArtProductJsonLd";
import { BreadcrumbJsonLd } from "@/components/BreadcrumbJsonLd";
import { YouMightAlsoLike } from "@/components/YouMightAlsoLike";
import { ArtLicensingSection } from "@/components/ArtLicensingSection";
import { MuralTemplate, type MuralDetails } from "@/components/MuralTemplate";
import { markdownToHtml } from "@/lib/markdown";
import { formatDimensions } from "@/lib/art-dimensions";

export const revalidate = 60;

// Prerender + ISR-cache each art piece; new pieces render on-demand.
export async function generateStaticParams() {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("art_pieces")
    .select("slug")
    .not("slug", "is", null);
  return (data || []).map((a) => ({ slug: a.slug as string }));
}

type ArtRow = {
  id: string;
  slug: string;
  title: string;
  image_path: string;
  image_alt: string | null;
  medium: string | null;
  width_in: number | null;
  height_in: number | null;
  depth_in: number | null;
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
  format_id: string | null;
  gallery_paths: string[] | null;
  in_situ_paths: string[] | null;
  licensing_direct_answer: string | null;
  licensing_content: string | null;
  licensing_key_points: string[] | null;
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
    .from("merch")
    .select("id, title, price, variant_type, variant_label, edition_size, editions_sold, image_url")
    .eq("source_art_id", art.id)
    .eq("status", "active");

  // art_skus -- the first-class commerce layer (original + limited prints).
  // Public RLS exposes only sellable rows; variants come nested.
  const { data: artSkusRaw } = await supabase
    .from("art_skus")
    .select(
      "id, format, sale_mode, price, status, edition_size, editions_sold, coa_enabled, display_order, " +
        "variants:sku_variants(id, label, price_delta, status, stock, display_order)",
    )
    .eq("art_id", art.id)
    .order("display_order");

  type RawArtSku = {
    id: string;
    format: "original" | "limited_print";
    sale_mode: "buy_now" | "inquire";
    price: number | null;
    status: string;
    edition_size: number;
    editions_sold: number;
    coa_enabled: boolean;
    variants: { id: string; label: string; price_delta: number; status: string; stock: number | null; display_order: number }[] | null;
  };
  const artSkus: ArtSku[] = ((artSkusRaw || []) as unknown as RawArtSku[]).map((s) => ({
    id: s.id,
    format: s.format,
    sale_mode: s.sale_mode,
    price: s.price,
    status: s.status,
    edition_size: s.edition_size,
    editions_sold: s.editions_sold,
    coa_enabled: s.coa_enabled,
    variants: (Array.isArray(s.variants) ? s.variants : [])
      .slice()
      .sort((a: { display_order: number }, b: { display_order: number }) => a.display_order - b.display_order)
      .map((v: { id: string; label: string; price_delta: number; status: string; stock: number | null }) => ({
        id: v.id,
        label: v.label,
        price_delta: v.price_delta,
        status: v.status,
        stock: v.stock,
      })),
  }));

  const { data: composition } = await supabase
    .from("art_composition")
    .select("content_html")
    .eq("art_id", art.id)
    .eq("status", "published")
    .maybeSingle();

  let formatSlug: string | null = null;
  let muralDetails: MuralDetails | null = null;
  if (art.format_id) {
    const { data: fmt } = await supabase.from("art_formats").select("slug").eq("id", art.format_id).maybeSingle();
    formatSlug = fmt?.slug || null;
  }
  if (formatSlug === "mural") {
    const { data: mural } = await supabase.from("mural_details").select("*").eq("art_id", art.id).maybeSingle();
    muralDetails = (mural as MuralDetails | null) || null;
  }

  const licensingHtml = art.licensing_content ? await markdownToHtml(art.licensing_content) : null;

  // Custom in-situ: load calibrated room scenes only when the piece has no hand-shot
  // in-room photos (those win), has real dimensions to scale against, and is not a
  // mural (murals keep their own MuralTemplate location treatment).
  let roomScenes: RoomScene[] = [];
  const hasManualInsitu = Array.isArray(art.in_situ_paths) && art.in_situ_paths.length > 0;
  if (!hasManualInsitu && art.width_in && art.height_in && formatSlug !== "mural") {
    const { data: scenes } = await supabase
      .from("room_scenes")
      .select(
        "slug, name, image_path, px_per_inch, anchor_x_pct, anchor_y_pct, wall_min_width_in, wall_max_width_in, light_warmth",
      )
      .eq("is_active", true)
      .order("display_order");
    roomScenes = ((scenes as RoomScene[] | null) || []).filter((s) => s.image_path && s.px_per_inch);
  }

  return {
    art: art as ArtRow,
    products: (products as ProductRow[] | null) || [],
    artSkus,
    compositionHtml: composition?.content_html || null,
    formatSlug,
    muralDetails,
    licensingHtml,
    roomScenes,
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
  const { art, products, artSkus, compositionHtml, formatSlug, muralDetails, licensingHtml, roomScenes } = data;

  const displayDims = formatDimensions(art.width_in, art.height_in, art.depth_in);

  const isMural = formatSlug === "mural" && muralDetails;
  const muralLocation = isMural && muralDetails ? {
    venueName: muralDetails.venue_name,
    venueUrl: muralDetails.venue_url,
    streetAddress: muralDetails.street_address,
    neighborhood: muralDetails.neighborhood,
    city: muralDetails.city,
    region: muralDetails.region,
    country: muralDetails.country,
    latitude: muralDetails.latitude,
    longitude: muralDetails.longitude,
    completionDate: muralDetails.completion_date,
    publicTopics: muralDetails.public_topics,
  } : null;

  const jsonLd = (
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
        dimensions={displayDims}
        yearCreated={art.year_created}
        focusKeyphrase={art.focus_keyphrase}
        secondaryKeyphrases={art.secondary_keyphrases || []}
        paaPairs={art.paa_pairs || []}
        muralLocation={muralLocation}
      />
      <ArtProductJsonLd
        slug={art.slug}
        title={art.title}
        description={art.citation_summary || art.art_summary || art.description}
        image={art.image_path}
        products={products}
      />
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://chadlewine.com" },
          { name: "Art", url: "https://chadlewine.com/art" },
          { name: art.title, url: `https://chadlewine.com/art/${art.slug}` },
        ]}
      />
    </>
  );

  if (isMural && muralDetails) {
    return (
      <>
        {jsonLd}
        <AdminEditButton href={`/admin/art/${art.slug}`} />
        <MuralTemplate
          art={art}
          mural={muralDetails}
          products={products}
          compositionHtml={compositionHtml}
          licensingHtml={licensingHtml}
          licensingDirectAnswer={art.licensing_direct_answer}
          licensingKeyPoints={art.licensing_key_points}
        />
      </>
    );
  }

  const metaCells = [
    art.medium ? { label: "Medium", value: art.medium } : null,
    displayDims ? { label: "Dimensions", value: displayDims } : null,
    art.year_created ? { label: "Year", value: String(art.year_created) } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  // Ribbon on the cube when the original is gone.
  const originalSku = artSkus.find((s) => s.format === "original");
  const cubeRibbon =
    originalSku?.status === "sold" ? "Sold" : originalSku?.status === "reserved" ? "Reserved" : null;

  return (
    <>
      {jsonLd}
      <AdminEditButton href={`/admin/art/${art.slug}`} />
      <div className="art-detail-page art-gallery">
        {/* Hero: cube on the left, buy/info on the right -- song-detail template. */}
        <div className="product-detail__grid art-detail__hero-grid">
          <div className="product-detail__art-col">
            <ArtFramedHero
              imagePath={art.image_path}
              imageAlt={art.image_alt}
              title={art.title}
              galleryPaths={art.gallery_paths}
              ribbon={cubeRibbon}
            />
          </div>

          <div className="product-detail__content-col">
            <h1 className="product-detail__title">{art.title}</h1>

            {metaCells.length > 0 && (
              <div className="product-detail__info-bar" data-cols={metaCells.length}>
                {metaCells.map((c) => (
                  <div key={c.label} className="product-detail__info-cell">
                    <span className="product-detail__info-label">{c.label}</span>
                    <span className="product-detail__info-value">{c.value}</span>
                  </div>
                ))}
              </div>
            )}

            {art.art_summary && <p className="art-detail__summary art-detail__summary--hero">{art.art_summary}</p>}

            {artSkus.length > 0 ? (
              <ArtSkuBuyPanel
                artId={art.id}
                artTitle={art.title}
                artSlug={art.slug}
                coverImage={art.image_path}
                skus={artSkus}
              />
            ) : (
              <ArtBuyPanel products={products} artTitle={art.title} />
            )}
          </div>
        </div>

        <div className="art-detail">
        <div className="art-detail__body">
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

          {art.in_situ_paths && art.in_situ_paths.length > 0 ? (
            <section className="art-detail__section">
              <h2>In the room</h2>
              <div className="art-detail__in-situ">
                {art.in_situ_paths.map((src, i) => (
                  <Image
                    key={i}
                    src={src}
                    alt={`${art.title} shown to scale in a room`}
                    width={1400}
                    height={1000}
                    sizes="(max-width: 1024px) 100vw, 800px"
                    className="art-detail__in-situ-img"
                  />
                ))}
              </div>
            </section>
          ) : roomScenes.length > 0 && art.width_in && art.height_in ? (
            <section className="art-detail__section">
              <h2>In the room</h2>
              <RoomView
                imagePath={art.image_path}
                imageAlt={art.image_alt}
                title={art.title}
                widthIn={art.width_in}
                heightIn={art.height_in}
                depthIn={art.depth_in}
                scenes={roomScenes}
              />
            </section>
          ) : null}

          {compositionHtml && (
            <section className="art-detail__section">
              <h2>Making of</h2>
              <div dangerouslySetInnerHTML={{ __html: compositionHtml }} />
            </section>
          )}

          <ArtLicensingSection
            title={art.title}
            directAnswer={art.licensing_direct_answer}
            contentHtml={licensingHtml}
            keyPoints={art.licensing_key_points}
          />

          <YouMightAlsoLike sourceType="art" sourceId={art.id} />

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
        </div>
      </div>
    </>
  );
}
