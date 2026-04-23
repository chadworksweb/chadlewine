import Link from "next/link";
import { ArtBuyPanel } from "@/components/ArtBuyPanel";
import { ArtPairingsSections, type PairedSong, type PairedArt } from "@/components/ArtPairingsSections";
import { focalCropStyle } from "@/lib/focal-crop";

export type MuralDetails = {
  street_address: string | null;
  venue_name: string | null;
  venue_type: string | null;
  venue_url: string | null;
  neighborhood: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  width_ft: number | null;
  height_ft: number | null;
  indoor: boolean | null;
  completion_date: string | null;
  wall_status: string | null;
  viewable_hours: string | null;
  commissioned_by: string | null;
  public_topics: string[] | null;
};

type ArtRow = {
  slug: string;
  title: string;
  image_path: string;
  image_alt: string | null;
  art_summary: string | null;
  description: string | null;
  chad_quote: string | null;
  hero_focal_x: number | null;
  hero_focal_y: number | null;
  hero_zoom: number | null;
  gallery_paths: string[] | null;
  paa_pairs: { question: string; answer: string }[] | null;
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

function formatDimensions(mural: MuralDetails): string | null {
  if (mural.width_ft && mural.height_ft) return `${mural.width_ft}×${mural.height_ft} ft`;
  if (mural.width_ft) return `${mural.width_ft} ft wide`;
  if (mural.height_ft) return `${mural.height_ft} ft tall`;
  return null;
}

function formatYear(date: string | null): string | null {
  if (!date) return null;
  const m = /^(\d{4})/.exec(date);
  return m ? m[1] : null;
}

function locationSubtitle(mural: MuralDetails): string | null {
  const parts: string[] = [];
  if (mural.venue_name) parts.push(mural.venue_name);
  if (mural.neighborhood) parts.push(mural.neighborhood);
  else if (mural.city) parts.push(mural.city);
  const year = formatYear(mural.completion_date);
  const head = parts.join(", ");
  if (head && year) return `${head} — ${year}`;
  return head || year;
}

function statusLabel(status: string | null): string | null {
  switch (status) {
    case "painted_over": return "Painted Over";
    case "damaged": return "Damaged";
    case "temporary": return "Temporary";
    case "active": return null;
    default: return null;
  }
}

export function MuralTemplate({
  art,
  mural,
  products,
  compositionHtml,
  pairedSongs,
  pairedArt,
}: {
  art: ArtRow;
  mural: MuralDetails;
  products: ProductRow[];
  compositionHtml: string | null;
  pairedSongs: PairedSong[];
  pairedArt: PairedArt[];
}) {
  const subtitle = locationSubtitle(mural);
  const dims = formatDimensions(mural);
  const status = statusLabel(mural.wall_status);
  const topics = Array.isArray(mural.public_topics) ? mural.public_topics.filter(Boolean) : [];
  const gallery = Array.isArray(art.gallery_paths) ? art.gallery_paths.filter(Boolean) : [];
  const addrLine = [mural.street_address, mural.neighborhood, mural.city, mural.region].filter(Boolean).join(", ");

  return (
    <article className="art-detail art-detail--mural">
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
        {subtitle && (
          <div className="art-detail__meta art-detail__meta--mural">
            <span>{subtitle}</span>
            {dims && <span>{dims}</span>}
            {mural.indoor != null && <span>{mural.indoor ? "Indoor" : "Outdoor"}</span>}
            {status && <span className="art-detail__status-badge">{status}</span>}
          </div>
        )}

        {art.art_summary && <p className="art-detail__summary">{art.art_summary}</p>}

        {(mural.venue_name || addrLine || mural.viewable_hours) && (
          <section className="art-detail__section art-detail__where">
            <h2>Where to see it</h2>
            {mural.venue_name && (
              <p className="art-detail__where-venue">
                {mural.venue_url ? (
                  <a href={mural.venue_url} target="_blank" rel="noreferrer">{mural.venue_name}</a>
                ) : mural.venue_name}
                {mural.venue_type && <span className="art-detail__where-type"> — {mural.venue_type}</span>}
              </p>
            )}
            {addrLine && <p className="art-detail__where-addr">{addrLine}</p>}
            {mural.viewable_hours && <p className="art-detail__where-hours">{mural.viewable_hours}</p>}
            {mural.commissioned_by && <p className="art-detail__where-commissioned">Commissioned by {mural.commissioned_by}</p>}
          </section>
        )}

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

        {gallery.length > 0 && (
          <section className="art-detail__section art-detail__gallery">
            <h2>Gallery</h2>
            <div className="art-detail__gallery-grid">
              {gallery.map((src, i) => (
                <img key={i} src={src} alt={`${art.title} — ${i + 1}`} className="art-detail__gallery-img" />
              ))}
            </div>
          </section>
        )}

        {topics.length > 0 && (
          <section className="art-detail__section art-detail__topics">
            <h2>In context</h2>
            <ul className="art-detail__topic-chips">
              {topics.map((t) => (
                <li key={t}>
                  <Link href={`/art/murals?topic=${encodeURIComponent(t)}`} className="art-detail__topic-chip">{t}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <ArtPairingsSections pairedSongs={pairedSongs} pairedArt={pairedArt} />

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
  );
}
