import type { Metadata } from "next";
import Link from "next/link";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient } from "@/lib/supabase-server";
import { SuperIndividualMerchCarousel, type CarouselProduct } from "@/components/SuperIndividualMerchCarousel";
import { MerchProductCard } from "@/components/MerchProductCard";
import { AlbumHero, type AlbumHeroItem } from "@/components/AlbumHero";
import { DiscographyCubeRadiant, type DiscographyCubeFace } from "@/components/DiscographyCubeRadiant";
import { CompassCard } from "@/components/CompassCard";
import { RCTop10Card } from "@/components/RCTop10Card";
import { MiniLyricalCharger } from "@/components/MiniLyricalCharger";
import { SuperIndividualPopupSection } from "@/components/SuperIndividualPopup";
import { SuperIndividualFloatingTag } from "@/components/SuperIndividualFloatingTag";

export const revalidate = 60;

const SUPER_INDIVIDUAL_DEFINITION =
  "A sovereign human being that has fully reclaimed their power from and operates outside of the failing institutions of modernity.";

const DEFAULT_METADATA: Metadata = {
  title: "Super Individual - Take Back Your Power",
  description: `Super Individual (noun): ${SUPER_INDIVIDUAL_DEFINITION} Chad Lewine's Super Individual Series — withdraw from institutional modernity, starting with your soundtrack.`,
  alternates: { canonical: "https://chadlewine.com/super-individual" },
  openGraph: {
    title: "Super Individual - Chad Lewine",
    description: `Super Individual (noun): ${SUPER_INDIVIDUAL_DEFINITION}`,
    url: "https://chadlewine.com/super-individual",
  },
};

const SUPER_INDIVIDUAL_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "DefinedTerm",
  name: "Super Individual",
  termCode: "super-individual",
  description: SUPER_INDIVIDUAL_DEFINITION,
  url: "https://chadlewine.com/super-individual#what",
  inDefinedTermSet: {
    "@type": "DefinedTermSet",
    name: "Chad Lewine — Super Individual",
    url: "https://chadlewine.com/super-individual",
  },
  inLanguage: "en",
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/super-individual", DEFAULT_METADATA);
}

const COLLECTION_SLUG = "super-individual";

interface ProductRow {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  image_alt: string | null;
  price: number | null;
  status: string;
}

interface AlbumRow {
  id: string;
  title: string;
  slug: string;
  release_date: string | null;
  cover_art_path: string | null;
  cover_art_alt: string | null;
  hero_focal_x: number | null;
  hero_focal_y: number | null;
  hero_zoom: number | null;
  card_focal_x: number | null;
  card_focal_y: number | null;
  card_zoom: number | null;
  release_formats: { label: string } | null;
}

interface SongRow {
  id: string;
  title: string;
  slug: string;
  release_date: string | null;
  art_image_path: string | null;
  art_alt: string | null;
  is_single: boolean | null;
  card_focal_x: number | null;
  card_focal_y: number | null;
  card_zoom: number | null;
  streaming_path: string | null;
  duration_seconds: number | null;
}

interface DiscoItem {
  id: string;
  type: "album" | "single";
  title: string;
  href: string;
  release_date: string | null;
  format_label: string | null;
  cover_art_path: string | null;
  card_focal_x: number | null;
  card_focal_y: number | null;
  card_zoom: number | null;
  faces: DiscographyCubeFace[];
}

async function fetchSuperIndividualMerch(): Promise<CarouselProduct[]> {
  const supabase = createPublicClient();

  const { data: collection } = await supabase
    .from("collections")
    .select("id")
    .eq("slug", COLLECTION_SLUG)
    .eq("status", "active")
    .maybeSingle();
  if (!collection) return [];

  const { data: assignments } = await supabase
    .from("collection_products")
    .select("product_id, position")
    .eq("collection_id", collection.id)
    .order("position", { ascending: true });

  const ids = (assignments || []).map((a) => a.product_id);
  if (ids.length === 0) return [];

  const { data: products } = await supabase
    .from("products")
    .select("id, slug, title, image_url, image_alt, price, status")
    .in("id", ids)
    .eq("status", "active");

  const productById = new Map((products || []).map((p) => [p.id, p as ProductRow]));
  const ordered: CarouselProduct[] = [];
  for (const a of assignments || []) {
    const p = productById.get(a.product_id);
    if (!p) continue;
    ordered.push({
      id: p.id,
      slug: p.slug,
      title: p.title,
      image_url: p.image_url,
      image_alt: p.image_alt,
      price: p.price,
    });
  }
  return ordered;
}

async function fetchReleases(): Promise<{ heroItems: AlbumHeroItem[]; discoItems: DiscoItem[] }> {
  const supabase = createPublicClient();

  const [albumsRes, singlesRes] = await Promise.all([
    supabase
      .from("albums")
      .select(
        "id, title, slug, release_date, cover_art_path, cover_art_alt, hero_focal_x, hero_focal_y, hero_zoom, card_focal_x, card_focal_y, card_zoom, release_formats(label)"
      )
      .eq("status", "published")
      .order("release_date", { ascending: false }),
    supabase
      .from("songs")
      .select(
        "id, title, slug, release_date, art_image_path, art_alt, is_single, card_focal_x, card_focal_y, card_zoom, streaming_path, duration_seconds"
      )
      .eq("status", "published")
      .eq("is_single", true)
      .order("release_date", { ascending: false }),
  ]);

  const albums = (albumsRes.data || []) as unknown as AlbumRow[];
  const singles = (singlesRes.data || []) as unknown as SongRow[];

  const singleIds = singles.map((s) => s.id);
  const albumArtBySong: Record<
    string,
    { cover_art_path: string | null; cover_art_alt: string | null } | null
  > = {};
  if (singleIds.length > 0) {
    const { data: junctions } = await supabase
      .from("album_songs")
      .select("song_id, album:albums(cover_art_path, cover_art_alt)")
      .in("song_id", singleIds);
    for (const j of junctions || []) {
      const songId = (j as { song_id: string }).song_id;
      const alb = Array.isArray((j as { album: unknown }).album)
        ? ((j as unknown) as { album: Array<{ cover_art_path: string | null; cover_art_alt: string | null }> }).album[0]
        : ((j as unknown) as { album: { cover_art_path: string | null; cover_art_alt: string | null } | null }).album;
      if (alb?.cover_art_path && !albumArtBySong[songId]) {
        albumArtBySong[songId] = alb;
      }
    }
  }

  // Cube faces — one query covers both kinds.
  const allReleaseIds = [
    ...albums.map((a) => a.id),
    ...singles.map((s) => s.id),
  ];
  const facesByKey = new Map<string, DiscographyCubeFace[]>();
  if (allReleaseIds.length > 0) {
    const { data: faces } = await supabase
      .from("release_cube_faces")
      .select("release_type, release_id, slot, media_type, media_path, focal_x, focal_y, zoom")
      .in("release_id", allReleaseIds)
      .order("slot");
    for (const f of (faces || []) as Array<DiscographyCubeFace & { release_type: string; release_id: string }>) {
      const key = `${f.release_type}:${f.release_id}`;
      const arr = facesByKey.get(key) || [];
      arr.push({
        slot: f.slot,
        media_type: f.media_type,
        media_path: f.media_path,
        focal_x: f.focal_x,
        focal_y: f.focal_y,
        zoom: f.zoom,
      });
      facesByKey.set(key, arr);
    }
  }

  // Build AlbumHero coverflow items — albums first, then singles, all in date order.
  const heroFromAlbums: AlbumHeroItem[] = albums
    .filter((a) => a.cover_art_path)
    .map((a) => ({
      slug: a.slug,
      title: a.title,
      releaseDate: a.release_date,
      artImagePath: a.cover_art_path || "",
      artAlt: a.cover_art_alt || a.title,
      href: `/music/albums/${a.slug}`,
      ctaLabel: "Open Album →",
      kind: "album" as const,
      focalX: a.card_focal_x != null ? a.card_focal_x / 100 : 0.5,
      focalY: a.card_focal_y != null ? a.card_focal_y / 100 : 0.5,
      zoom: a.card_zoom != null && a.card_zoom >= 1 ? a.card_zoom : 1,
    }));

  const heroFromSingles: AlbumHeroItem[] = singles
    .map((s) => {
      const cover = s.art_image_path || albumArtBySong[s.id]?.cover_art_path || null;
      const alt = s.art_alt || albumArtBySong[s.id]?.cover_art_alt || s.title;
      if (!cover) return null;
      const audio =
        s.streaming_path && s.duration_seconds
          ? { songId: s.id, streamingUrl: s.streaming_path, durationSeconds: s.duration_seconds }
          : null;
      return {
        slug: s.slug,
        title: s.title,
        releaseDate: s.release_date,
        artImagePath: cover,
        artAlt: alt,
        href: `/music/songs/${s.slug}`,
        ctaLabel: "Explore Song →",
        kind: "single" as const,
        focalX: s.card_focal_x != null ? s.card_focal_x / 100 : 0.5,
        focalY: s.card_focal_y != null ? s.card_focal_y / 100 : 0.5,
        zoom: s.card_zoom != null && s.card_zoom >= 1 ? s.card_zoom : 1,
        audio,
      } as AlbumHeroItem;
    })
    .filter((x): x is AlbumHeroItem => x !== null);

  const heroItems = [...heroFromAlbums, ...heroFromSingles].sort((a, b) => {
    const da = a.releaseDate ? new Date(a.releaseDate).getTime() : 0;
    const db = b.releaseDate ? new Date(b.releaseDate).getTime() : 0;
    return db - da;
  });

  // Build discography items for the cube grid.
  const discoFromAlbums: DiscoItem[] = albums.map((a) => ({
    id: a.id,
    type: "album" as const,
    title: a.title,
    href: `/music/albums/${a.slug}`,
    release_date: a.release_date,
    format_label: a.release_formats?.label || "Album",
    cover_art_path: a.cover_art_path,
    card_focal_x: a.card_focal_x,
    card_focal_y: a.card_focal_y,
    card_zoom: a.card_zoom,
    faces: facesByKey.get(`album:${a.id}`) || [],
  }));

  const discoFromSingles: DiscoItem[] = singles.map((s) => ({
    id: s.id,
    type: "single" as const,
    title: s.title,
    href: `/music/songs/${s.slug}`,
    release_date: s.release_date,
    format_label: "Single",
    cover_art_path: s.art_image_path || albumArtBySong[s.id]?.cover_art_path || null,
    card_focal_x: s.card_focal_x,
    card_focal_y: s.card_focal_y,
    card_zoom: s.card_zoom,
    faces: facesByKey.get(`song:${s.id}`) || [],
  }));

  const discoItems = [...discoFromAlbums, ...discoFromSingles]
    .filter((d) => d.cover_art_path)
    .sort((a, b) => {
      const da = a.release_date ? new Date(a.release_date).getTime() : 0;
      const db = b.release_date ? new Date(b.release_date).getTime() : 0;
      return db - da;
    });

  return { heroItems, discoItems };
}

export default async function SuperIndividualPage() {
  const [merch, releases] = await Promise.all([
    fetchSuperIndividualMerch(),
    fetchReleases(),
  ]);
  const { heroItems, discoItems } = releases;

  return (
    <div id="page-super-individual" className="page-super-individual">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SUPER_INDIVIDUAL_JSON_LD) }}
      />
      {/* Section 1 — Hero */}
      <section className="si-hero" aria-label="Super Individual">
        <div className="si-hero__inner">
          <h1 className="si-hero__eyebrow">Take back your power</h1>
          <h2 className="si-hero__headline">Super<br />Individual</h2>
          <p className="si-hero__sub">Chad Lewine's Super Individual Series.</p>
          <div className="si-hero__nav">
            <a href="#what" className="si-hero__nav-link">Super Individual</a>
            <a href="#thesis" className="si-hero__nav-link">My Thesis</a>
            <a href="#door-merch" className="si-hero__nav-link">Merch</a>
            <a href="#door-music" className="si-hero__nav-link">My Music</a>
            <a href="#popup" className="si-hero__nav-link">Pop-Up</a>
          </div>
        </div>
      </section>

      {/* Section 2 — What is a Super Individual? */}
      <section className="si-section" id="what" aria-labelledby="si-what-heading">
        <div className="glyph-title-bar glyph-title-bar--top">
          <span className="glyph-title-bar__label" aria-hidden="true">░▒▓█</span>
          <h2 className="glyph-title-bar__heading" id="si-what-heading">
            What is a Super Individual?
          </h2>
          <span className="glyph-title-bar__label" aria-hidden="true">█▓▒░</span>
        </div>
        <div className="si-prose">
          <p>
            Super Individual is a phrase that&apos;s emerging from the AI productivity space that describes the ability of one person to execute at the level of a team; of an entire agency; an entire company. I&apos;m taking it further. <strong>My definition of Super Individual is:</strong>
          </p>
          <p className="si-excerpt">
            <span className="si-excerpt__head">
              <dfn id="super-individual-term"><strong>Super Individual</strong></dfn> · <em>noun</em>
            </span>
            <em className="si-excerpt__def">{SUPER_INDIVIDUAL_DEFINITION}</em>
          </p>
        </div>

        <div className="si-what__grid">
          <div className="si-what__steps-wrap">
            <p className="si-what__steps-lead">A Super Individual is someone who:</p>
            <ol className="si-what__steps">
              <li>Realizes that their energy is being drained</li>
              <li>Locates where the drains are</li>
              <li>Calls out the drain, either to themselves or others</li>
              <li>Cuts off the drain and reclaims 100% of their energy</li>
              <li>Audits to see if they're draining others</li>
            </ol>
          </div>

          <div className="si-prose">
            <p>
              A single human being who is fully empowered is more powerful than any institution that derives their power from draining others. These institutions cannot stand, cannot function when we all take our power back.
            </p>
            <p>
              A super individual is <strong>the sovereign, empowered being</strong>: in full and total control of the universally-sourced energy running through their mind, body and soul. An individual wholly reliant on themselves with no physical or non-physical external institutional support, guidance or programming.
            </p>
            <p>
              The Super Individual is a person that has been fully deprogrammed from the at-birth programming of modernity.
            </p>
            <p className="si-what__note">
              Institutions are not only tangible and visible organizations (government, corporate, communal, spiritual) but also intangible and invisible ways of being, thinking and communicating.
            </p>
          </div>
        </div>
      </section>

      {/* Section 3 — The Thesis */}
      <section className="si-section" id="thesis" aria-labelledby="si-thesis-heading">
        <div className="glyph-title-bar glyph-title-bar--top">
          <span className="glyph-title-bar__label" aria-hidden="true">░▒▓█</span>
          <h2 className="glyph-title-bar__heading" id="si-thesis-heading">
            Reclaim the soundtrack to your life
          </h2>
          <span className="glyph-title-bar__label" aria-hidden="true">█▓▒░</span>
        </div>
        <div className="si-prose">
          <p>
            I believe one of the monolithic institutions that is draining our power is the recorded music business. I&apos;ve spent my entire conscious life—over 30 years—consuming, studying, analyzing and producing recorded music. For the entirety of that period, I&apos;ve known, in different severities, that there was an invisible yet non-trivial power behind music; a power whose origin and foundation was being intentionally deluded, secret and hidden from the masses; the consumers of such music.
          </p>
          <p>
            Music being applauded and marketed as entertainment is a lie. Music is power. Music is prescription medicine for the mind. Music is a highly advanced and complex metaphysical technology that influences brain chemistry on a scientifically proven, physical level.
          </p>
          <p>
            Music is real and raw <strong>power.</strong> Whether that power is used for good or bad lies in the hands of those wielding it, and I believe that those currently wielding the power en masse are using it for control, suppression and dominance over the modern human populace.
          </p>
          <p>
            Music feels good, but most people don&rsquo;t have the tools (or desire) to understand why or how, and that is what those in control bank on. A society consuming the music that we&rsquo;re consuming at the rate and density that we&rsquo;re consuming it will show signs of dysfunction. And aren&rsquo;t we showing dysfunction en masse? But the powers that be have positioned themselves and the power of music to be non-targets of this dysfunction by default. The programming and propaganda we&rsquo;re fed is that &ldquo;music is harmless&rdquo; and &ldquo;music is actually an outlet for everything else going wrong in the world.&rdquo; But those are both lies. Popular music is actually one of the main perpetrators of what&rsquo;s going wrong in the world because music directly and without fail influences each listener&rsquo;s internal world, and when our internal worlds are corrupted and degraded by the music coming from the mainstream propaganda megaphone, society falters: mental illness and instability spikes, yet the perpetrators that contribute to the instability are so highly regarded and in collusion with the other population control platforms that the real cause of the symptom never gets uncovered. Then, when there is no framework to support and solve the mental illness and societal fragmenting we are experiencing, society collapses.
          </p>
        </div>
      </section>

      {/* ============ THREE DOORS ============ */}
      <section className="si-section si-section--doors-intro" id="doors">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/super-individual/rise-with-feeling-transparent.webp"
          alt=""
          aria-hidden="true"
          className="si-doors-intro__bg"
        />
        <div className="si-prose si-doors-intro__prose">
          <p>
            It is with this awareness that I create and present the following three pathways to offer individuals an entry point to reclaiming their power on the road to becoming the Super Individual that they were already born as.
          </p>
        </div>
      </section>

      {/* Door 1 — Merch */}
      <section id="door-merch" className="si-door si-door--merch" aria-labelledby="si-door-merch-heading">
        <p className="si-door__eyebrow">Merchandise</p>
        <div className="glyph-title-bar glyph-title-bar--top">
          <span className="glyph-title-bar__label" aria-hidden="true">░▒▓█</span>
          <h2 className="glyph-title-bar__heading" id="si-door-merch-heading">
            Reclaim your light emanation
          </h2>
          <span className="glyph-title-bar__label" aria-hidden="true">█▓▒░</span>
        </div>

        <div className="si-prose" style={{ marginBottom: 'var(--space-xl)' }}>
          <p>
            Reclaim your power by donning the Super Individual Series 1 by Chad Lewine. Featuring original artwork designed with the intention of positively disrupting the immediate visible light spectrum in an effort to create a space where the individuals in proximity may feel literal atomic shifts in a way that allows them to expand and express themselves in a way the rigid structural blandness permeating our modern public spaces. Don this apparel to emanate Super Individuality. Not in a sense of superiority, but total reclamation of one&rsquo;s and all&rsquo;s individual empowerment.
          </p>
        </div>

        {merch.length > 0 ? (
          <>
            <div className="si-merch-stage">
              <SuperIndividualMerchCarousel products={merch} />
            </div>
            <div className="si-merch-grid">
              {merch.slice(0, 9).map((p) => (
                <MerchProductCard
                  key={p.id}
                  id={p.id}
                  slug={p.slug}
                  title={p.title}
                  image_url={p.image_url}
                  image_alt={p.image_alt}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="si-door__empty">
            <p>The Series collection is being assembled. Check back shortly.</p>
            <Link href="/merch" className="si-door__cta">Browse all merch →</Link>
          </div>
        )}
      </section>

      {/* Door 2 — Music (HeroLens + Discography 4-up) */}
      <section id="door-music" className="si-door si-door--music" aria-labelledby="si-door-music-heading">
        <p className="si-door__eyebrow">Original Music</p>
        <div className="glyph-title-bar glyph-title-bar--top">
          <span className="glyph-title-bar__label" aria-hidden="true">░▒▓█</span>
          <h2 className="glyph-title-bar__heading" id="si-door-music-heading">
            Follow my personal reclamation journey
          </h2>
          <span className="glyph-title-bar__label" aria-hidden="true">█▓▒░</span>
        </div>

        <p className="si-excerpt">
          Some people that want to make change in the world write books, some hold retreats, and some make speeches or hold sermons. I write songs. My songs are both a living, growing archive of my deprogramming personal journey, <em>and</em> a new trail to follow, should you choose to venture off the beaten path of modern institutional ways of thinking, living, and being.
        </p>

        <div className="si-prose" style={{ marginBottom: 'var(--space-xl)' }}>
          <p>
            Reclaim your power by listening to music specifically designed to call out institutional dysfunction and raise your frequency by meeting you where you&rsquo;re at and bringing you higher, should you be open to it, as opposed to most popular music these days which meets you where you&rsquo;re at by relating to or commiserating with what-is instead of what could be, let alone corrupting or degrading your vibe entirely.
          </p>
          <p>
            Chad Lewine&rsquo;s music is designed to make you think without thinking; to change without trying; to lay tracks of new neural pathways you can continue to carve deeper and deeper into new thought patterns, which may in turn create micro improvements in your life that stack over time.
          </p>
        </div>

        {heroItems.length > 0 && (
          <div className="si-album-hero">
            <AlbumHero items={heroItems} />
          </div>
        )}

        {discoItems.length > 0 && (
          <>
            <div className="si-discography si-discography--three-up">
              {discoItems.slice(0, 6).map((item) => {
                const year = item.release_date
                  ? new Date(item.release_date).getFullYear()
                  : null;
                return (
                  <div key={item.id} className="si-discography__card discography-grid__card">
                    <DiscographyCubeRadiant
                      title={item.title}
                      href={item.href}
                      coverArtPath={item.cover_art_path}
                      cardFocalX={item.card_focal_x}
                      cardFocalY={item.card_focal_y}
                      cardZoom={item.card_zoom}
                      faces={item.faces}
                    />
                    <div className="discography-grid__info">
                      <span className="discography-grid__meta">
                        <Link href={item.href} className="discography-grid__title">
                          {item.title}
                        </Link>
                        {year && <span className="discography-grid__year">({year})</span>}
                        {item.format_label && (
                          <span className="discography-grid__format">{item.format_label}</span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="si-door__footer">
          <Link href="/music/songs" className="si-door__cta si-door__cta--primary">Explore my song database →</Link>
          <Link href="/music" className="si-door__cta">Open my music hub →</Link>
          <Link href="/discography" className="si-door__cta">See my full discography →</Link>
        </div>
      </section>

      {/* Door 3 — Rising Compass */}
      <section className="si-door si-door--rc" aria-labelledby="si-door-rc-heading">
        <p className="si-door__eyebrow">Rising Compass</p>
        <div className="glyph-title-bar glyph-title-bar--top">
          <span className="glyph-title-bar__label" aria-hidden="true">░▒▓█</span>
          <h2 className="glyph-title-bar__heading" id="si-door-rc-heading">
            Scan what you&rsquo;re listening to right now
          </h2>
          <span className="glyph-title-bar__label" aria-hidden="true">█▓▒░</span>
        </div>

        <div className="si-prose" style={{ marginBottom: 'var(--space-xl)' }}>
          <p>
            For my whole adult life I have been trying to spread the idea that the modern music industry is corrupted and most current music keeps us trapped and complacent in lower vibrations. When I say this on social media, obviously I get laughed out of the room and have even been threatened because some feel that this message is an attempt to censor artistic expression. Those people don&rsquo;t know me at all. What I am actually trying to do is expose the truth that art is not inherently good, positive or uplifting. Art is a manifestation of thought; it is a bring-into-physical that which is non-physical. Art is the first step in manifesting from the ether into physical reality, and not all that is available in the ether has a place in this world we all, ideally, want to remain wholesome, beautiful and safe.
          </p>
          <p>
            That is not to say that negativity has no place in our art or our world, for positive and negative must exist simultaneously. I just believe that darkness has overstepped, that we have manifested an imbalance of negativity, and that should be clear to anyone paying real attention to the world we live in. There is too much darkness, and lots of that is being perpetuated by not only the music industry, but the entertainment industry at large.
          </p>
          <p>
            So, instead of trying to scream over the noise and static of the degraded social media algorithms, I built the Rising Compass, a free tool that tracks and diagnoses songs (not artists) for their positive/negative charge on a scale from 100 to -100, from Ascended down to Corrupted, as a meter for you to make your own decision about what you decide to listen to.
          </p>
          <p>
            I believe this is an evolution of the Parental Advisory Explicit Content label, an initiative that could have been helpful but was likely rooted in racism and has been rendered ineffective in the digital/streaming age. The explicit label tells us if there are harsh words and profanity, but there is no label that tells us what the song is actually saying, and the modern music industry has gotten so creative and so sly that the messages that are slipped into the music we&rsquo;re listening to fly right under the radar not only of the explicit label but to anyone not dissecting the cohesive messages a song is delivering, messages that are more damning than any F-bomb could ever be.
          </p>
        </div>

        <div className="si-door__rc-grid si-door__rc-grid--3up">
          <CompassCard />
          <RCTop10Card />
          <div className="si-door__rc-charger rc-card rc-card--charger">
            <div className="rc-card__header">Read any song&rsquo;s frequency</div>
            <p className="rc-card__desc">
              Paste the lyrics. The Rising Compass calibration engine reads the frequency it carries.
            </p>
            <MiniLyricalCharger />
          </div>
        </div>
      </section>

      {/* Section 5 — The Pop-Up teaser. The JSON-LD lives on the canonical
          event page at /irl/super-individual-pop-up (set there via
          includeEventSchema). The teaser links there via showEventPageLink. */}
      <SuperIndividualPopupSection showEventPageLink />

      {/* Section 6 — Who Is Chad Lewine? The about-the-author closer. */}
      <section className="si-section si-who" id="who-is-chad-lewine" aria-labelledby="si-who-heading">
        <p className="si-door__eyebrow">Who Am I</p>
        <div className="glyph-title-bar glyph-title-bar--top">
          <span className="glyph-title-bar__label" aria-hidden="true">░▒▓█</span>
          <h2 className="glyph-title-bar__heading" id="si-who-heading">
            Chad Lewine: The Deprogrammer
          </h2>
          <span className="glyph-title-bar__label" aria-hidden="true">█▓▒░</span>
        </div>

        <div className="si-who__grid">
          <div className="si-who__image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/super-individual/chad-lewine_the-deprogrammer_blue-glow.webp"
              alt="Chad Lewine, the Deprogrammer"
            />
          </div>

          <div className="si-prose si-who__copy">
            <p>
              I thought that I was fully autonomous and sovereign my whole life, but the reality is I was programmed by my parents, (mostly my mother) to live by their rules and to be constrained by their perceptions, their reality, their expectations, their limits, their dreams and their goals.
            </p>
            <p>
              Due to this total lack of unconditional love from both parents, I ended up being programmed by the media and specifically sex. I was programmed to perceive sex as love; one of the biggest programming initiatives in our current society. This programming eventually led me into a deeply toxic and abusive relationship driven by substance abuse and aggressive co-dependency.
            </p>
            <p>
              It was in this relationship that I hit real rock bottom, which for me was dangerous substance use and interactions with the criminal justice system. This forced me to examine how I got there and how to get out. I did that un-learning (deprogramming) through an ongoing life-time of metaphysical and spiritual study bolstered by 1.5 years straight of weekly talk therapy that book-ended my being arrested in April 2022 and the successful leaving of the abusive relationship.
            </p>
            <p>
              I was also programmed to follow the mainstream route of chasing a music dream; to get a record deal, to have millions of fans and stadium tours. I was guided by Michael Jackson but I also was programmed (maybe even programmed myself) to believe that if I wasn&rsquo;t reaching that, I wasn&rsquo;t successful.
            </p>
            <p>
              I was also programmed by the social media platforms to try to mold myself into something that could go viral. I wasn&rsquo;t changing my message or my appearance to be something I&rsquo;m not, but I did believe that I needed to be on these platforms to find success.
            </p>
            <p>
              All of this is to say, I had my own type of programming installed and I&rsquo;ve faced and overcome myriad challenges, those challenges being the precise origins of my music and art, all culminating now, in 2026, as a movement that I&rsquo;m calling the Super Individual.
            </p>
            <Link href="/chad-lewine" className="si-popup__cta si-popup__cta--primary si-who__cta">
              Read my full life story thus far &rarr;
            </Link>
          </div>
        </div>
      </section>

      <SuperIndividualFloatingTag />
    </div>
  );
}
