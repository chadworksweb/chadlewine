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
import { FrutigerMiniPlayer } from "@/components/FrutigerMiniPlayer";

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

// Raw shape as Supabase returns it: foreign-key joins come back as arrays
// (or a single object) depending on cardinality. We normalize before use.
type Joined<T> = T | T[] | null;

interface AlbumRowRaw extends Omit<AlbumRow, "release_formats"> {
  release_formats: Joined<{ label: string }>;
}

interface AlbumJunctionRaw {
  song_id: string;
  album: Joined<{ cover_art_path: string | null; cover_art_alt: string | null }>;
}

function firstOrNull<T>(value: Joined<T> | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
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

  const albumsRaw = (albumsRes.data || []) as AlbumRowRaw[];
  const albums: AlbumRow[] = albumsRaw.map(({ release_formats, ...rest }) => ({
    ...rest,
    release_formats: firstOrNull(release_formats),
  }));
  const singles = (singlesRes.data || []) as SongRow[];

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
    for (const j of (junctions || []) as AlbumJunctionRaw[]) {
      const alb = firstOrNull(j.album);
      if (alb?.cover_art_path && !albumArtBySong[j.song_id]) {
        albumArtBySong[j.song_id] = alb;
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

interface FindingFreedomSong {
  title: string;
  slug: string;
  streamingUrl: string;
  durationSeconds: number;
  artUrl: string | null;
  artAlt: string | null;
}

async function fetchFindingFreedom(): Promise<FindingFreedomSong | null> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("songs")
    .select("id, title, slug, streaming_path, duration_seconds, art_image_path, art_alt")
    .eq("slug", "finding-freedom")
    .eq("status", "published")
    .maybeSingle();
  if (!data || !data.streaming_path || !data.duration_seconds) return null;

  let artUrl: string | null = data.art_image_path;
  let artAlt: string | null = data.art_alt;
  // Fallback: pull cover art from the song's album when the song itself
  // has no art_image_path set.
  if (!artUrl) {
    const { data: junction } = await supabase
      .from("album_songs")
      .select("album:albums(cover_art_path, cover_art_alt)")
      .eq("song_id", data.id)
      .limit(1);
    const first = (junction || [])[0] as { album: Joined<{ cover_art_path: string | null; cover_art_alt: string | null }> } | undefined;
    const album = firstOrNull(first?.album);
    if (album?.cover_art_path) {
      artUrl = album.cover_art_path;
      artAlt = artAlt || album.cover_art_alt || data.title;
    }
  }

  return {
    title: data.title,
    slug: data.slug,
    streamingUrl: data.streaming_path,
    durationSeconds: data.duration_seconds,
    artUrl,
    artAlt,
  };
}

export default async function SuperIndividualPage() {
  const [merch, releases, findingFreedom] = await Promise.all([
    fetchSuperIndividualMerch(),
    fetchReleases(),
    fetchFindingFreedom(),
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
          <h2 className="si-hero__headline">Super Individual</h2>
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
        <div className="si-banner-bar">
          <div className="glyph-title-bar glyph-title-bar--top">
          <span className="glyph-title-bar__label" aria-hidden="true">░▒▓█</span>
          <h2 className="glyph-title-bar__heading" id="si-what-heading">
            What is a Super Individual?
          </h2>
          <span className="glyph-title-bar__label" aria-hidden="true">█▓▒░</span>
          </div>
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
          </div>
        </div>

        <div className="si-prose" style={{ marginTop: 'var(--space-lg)' }}>
          <p>
            <strong>Institutions are not only tangible and visible organizations (government, corporate, communal, spiritual) but also intangible and invisible ways of being, thinking and communicating, including interpersonal relationships.</strong>
          </p>
          <p>
            It is important to note that this is not about denouncing culture and society. It&rsquo;s not about abandoning civilization and living off the grid. It&rsquo;s about seeing our modern culture, society and civilization for what they are. It&rsquo;s about recognizing the energy flows both in and out of our beingness and deciding where our energy deserves to flow and where it doesn&rsquo;t.
          </p>
          <p>
            We still need to rely on the electric and utility companies. We still need to rely on our government to serve and protect us, however well or poorly they do so. We still need to engage in commerce so that infrastructure, housing and food supplies can be built and maintained. We still need to participate in our communities. But the point of inflection is, are we participating in all of those institutions mindlessly? Blindly? Or are we participating with clear intention and total cognition? That is the way of the Super Individual. We cannot make change by abandoning our humanity and our fellow man. We cannot bring change to the world by scoffing and hiding ourselves away. We make change by calling out those who do harm, withdrawing our energy from where it is being abused, and redirecting it to where it is useful, both for ourselves, and for all.
          </p>
          <p>
            We still need to have relationships with people. We still need love. We still need companionship and partnership. We still need physical intimacy. We still need to procreate. But it&rsquo;s about looking at what terms have been agreed to on top of or beneath those interactions. What are you giving to and what are you asking of others along with those engagements and are those terms in favor of extraction and control or are they unconditional with no strings attached?
          </p>
        </div>
      </section>

      {/* Section 3 — The Thesis */}
      <section className="si-section" id="thesis" aria-labelledby="si-thesis-heading">
        <div className="si-banner-bar">
          <div className="glyph-title-bar glyph-title-bar--top">
          <span className="glyph-title-bar__label" aria-hidden="true">░▒▓█</span>
          <h2 className="glyph-title-bar__heading" id="si-thesis-heading">
            Reclaim the soundtrack to your life
          </h2>
          <span className="glyph-title-bar__label" aria-hidden="true">█▓▒░</span>
          </div>
        </div>
        <div className="si-prose">
          <p>
            I believe one of the monolithic institutions that is draining our power is the recorded music business. I&apos;ve spent my entire conscious life—over 30 years—consuming, studying, analyzing and producing recorded music. For the entirety of that period, I&apos;ve known, in different severities, that there was an invisible yet non-trivial power behind music; a power whose origin and foundation was being intentionally deluded, kept secret and hidden from the masses; the consumers of such music.
          </p>
          <p>
            Music being applauded and marketed as entertainment is a lie. Music is power. Music is prescription medicine for the mind. Music is a highly advanced and complex metaphysical technology that influences brain chemistry on a scientifically proven, physical level.
          </p>
          <p>
            Music is real and raw <strong>power.</strong> Whether that power is used for good or bad lies in the hands of those wielding it, and I believe that those currently wielding the power en masse are using it for control, suppression and dominance over the modern human populace.
          </p>
          <p>
            Music feels good, but most people don&rsquo;t have the tools (or desire) to understand why or how, and that is what those in control bank on. A society consuming the music that we&rsquo;re consuming at the rate and density that we&rsquo;re consuming it will show signs of dysfunction. And aren&rsquo;t we showing dysfunction en masse? But the powers that be have positioned themselves and the power of music to be non-targets of this dysfunction by default. The programming and propaganda we&rsquo;re fed is that &ldquo;music is harmless&rdquo; and &ldquo;music is actually an outlet for everything else going wrong in the world.&rdquo;
          </p>
          <p>
            But those are both lies.
          </p>
          <p>
            Popular music is actually one of the main perpetrators of what&rsquo;s going wrong in the world because music directly and without fail influences each listener&rsquo;s internal world, and when our internal worlds are corrupted and degraded by the music coming from the mainstream propaganda megaphone, society falters: mental illness and instability spikes, yet the perpetrators that contribute to the instability are so highly regarded and in collusion with the other population control platforms that the real cause of the symptom never gets uncovered. Then, when there is no framework to support and solve the mental illness and societal fragmenting we are experiencing, society collapses.
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
        <p className="si-door__eyebrow">Reclaim your light emanation</p>
        <div className="si-banner-bar">
          <div className="glyph-title-bar glyph-title-bar--top">
          <span className="glyph-title-bar__label" aria-hidden="true">░▒▓█</span>
          <h2 className="glyph-title-bar__heading" id="si-door-merch-heading">
            Super Individual Merchandise
          </h2>
          <span className="glyph-title-bar__label" aria-hidden="true">█▓▒░</span>
          </div>
        </div>

        <div className="si-prose" style={{ marginBottom: 'var(--space-xl)' }}>
          <p>
            Reclaim your power by donning my Super Individual Series 1. Featuring original artwork I designed with the intention of positively disrupting the immediate visible light spectrum in an effort to create a space where the individuals in proximity may feel literal atomic shifts in a way that allows them to expand and express themselves in a way the rigid structural blandness permeating our modern public spaces does not. Don this apparel to emanate Super Individuality. Not in a sense of superiority, but total reclamation of one&rsquo;s and all&rsquo;s individual empowerment.
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
        <p className="si-door__eyebrow">Follow my personal reclamation journey</p>
        <div className="si-banner-bar">
          <div className="glyph-title-bar glyph-title-bar--top">
          <span className="glyph-title-bar__label" aria-hidden="true">░▒▓█</span>
          <h2 className="glyph-title-bar__heading" id="si-door-music-heading">
            Super Individual Music
          </h2>
          <span className="glyph-title-bar__label" aria-hidden="true">█▓▒░</span>
          </div>
        </div>

        <p className="si-excerpt">
          Some people that want to make change in the world write books, some hold retreats, and some make speeches or hold sermons. I write songs. My songs are both a living, growing archive of my own, personal deprogramming journey, <em>and</em> a new trail to follow, should one choose to venture off the beaten path of modern institutional ways of thinking, living, and being.
        </p>

        <div className="si-prose" style={{ marginBottom: 'var(--space-xl)' }}>
          <p>
            Reclaim your power by listening to music specifically designed to call out institutional dysfunction and raise your frequency by meeting you where you&rsquo;re at and bringing you higher, should you be open to it, as opposed to most popular music these days which meets you where you&rsquo;re at by relating to or commiserating with what-is instead of what could be, let alone corrupting or degrading your vibe entirely.
          </p>
          <p>
            My music is designed to make you think without thinking; to change without trying; to lay tracks of new neural pathways you can continue to carve deeper and deeper into new thought patterns, which may in turn create micro improvements in your life that stack over time.
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
        <p className="si-door__eyebrow">Scan what you&rsquo;re listening to right now</p>
        <div className="si-banner-bar">
          <div className="glyph-title-bar glyph-title-bar--top">
          <span className="glyph-title-bar__label" aria-hidden="true">░▒▓█</span>
          <h2 className="glyph-title-bar__heading" id="si-door-rc-heading">
            Super Individual Soundtrack
          </h2>
          <span className="glyph-title-bar__label" aria-hidden="true">█▓▒░</span>
          </div>
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
        <div className="si-banner-bar">
          <div className="glyph-title-bar glyph-title-bar--top">
          <span className="glyph-title-bar__label" aria-hidden="true">░▒▓█</span>
          <h2 className="glyph-title-bar__heading" id="si-who-heading">
            Chad Lewine: The Deprogrammer
          </h2>
          <span className="glyph-title-bar__label" aria-hidden="true">█▓▒░</span>
          </div>
        </div>

        <div className="si-who__grid">
          <div className="si-who__image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/super-individual/chad-lewine_the-deprogrammer_blue-glow.webp"
              alt="Chad Lewine, the Deprogrammer"
            />
            {findingFreedom && (
              <FrutigerMiniPlayer
                songTitle={findingFreedom.title}
                songSlug={findingFreedom.slug}
                streamingUrl={findingFreedom.streamingUrl}
                durationSeconds={findingFreedom.durationSeconds}
                artUrl={findingFreedom.artUrl}
                artAlt={findingFreedom.artAlt}
                style={{ "--frutiger-mini-top": "12%", "--frutiger-mini-right": "32%" } as React.CSSProperties}
              />
            )}
          </div>

          <div className="si-prose si-who__copy">
            <p>
              I thought that I was fully autonomous and sovereign my whole life, but the reality is I was running plenty of programs by the time I was an adult. I had avoided the big, obvious programs like organized religion, 9-5 corporate or retail employment, and familial culthood disguised as the modern USAmerican family (the flipside of that being that I never had a family at all,) but boy, in the years leading up to writing this, I realized just how programmed I really was.
            </p>

            <h3>The Parental Program</h3>
            <p>
              As we all are, I was programmed by my parents, (mostly my mother) to live by their rules and to be constrained by their perceptions, their reality, their expectations, their limits, their dreams and their goals. My mother was a narcissistic tyrant and my father was emotionally absent and defaulted to my mother. There was no sovereignty under her rule. Her love (and by her approval, my father&rsquo;s) was earned or withdrawn day by day based on my perceived successes and failures.
            </p>

            <h3>The Sex-as-Love Program</h3>
            <p>
              Due to this total lack of unconditional love from both parents, I was starved for love and ended up being programmed to perceive sex as love and success; one of the biggest media-based programming initiatives in our current society. This programming eventually led me into a deeply toxic and abusive relationship driven by substance abuse and aggressive co-dependency.
            </p>

            <h3>The Political Program</h3>
            <p>
              I was raised in a non-political household, but my father was a registered independent and for most of my cognitive life, my mother was a Democrat. Once I realized I was gay and came out, I was scooped up by the Democratic party program and became part of their &ldquo;side.&rdquo; It doesn&rsquo;t matter which side, a side is a side, and I was on one.
            </p>

            <h3>The Substance Use Program</h3>
            <p>
              I was regularly smoking cigarettes, drinking alcohol and using weed by the time I was 18. I thought this was the way of the artist, the rebel, the renegade. These were not just factions of my identity but also subconscious middle fingers to my mother.
            </p>

            <h3>The Starving Artist Program</h3>
            <p>
              Tagging along with substance use was my donning the narrative and label of the starving artist. I believed, though not to the deepest extent that some do, that as an artist, I was inherently going to be broke and poor before I became rich and famous&mdash;there was no in between. This was due to cultural and socio-economic programming, but also partly due to ignorance (or rejection) of the possibility of being a working class artist, which was disappearing anyway.
            </p>

            <h3>The Music Industry Program</h3>
            <p>
              I was also programmed to follow the mainstream &ldquo;big dream&rdquo; route of signing a major label record deal, having millions of fans and stadium tours. I was guided by Michael Jackson&rsquo;s blueprint, but I also was programmed (maybe even programmed myself) to believe that if I wasn&rsquo;t reaching that, I wasn&rsquo;t successful.
            </p>

            <h3>The Social Media Program</h3>
            <p>
              I began my artist journey when social media was in its infancy. It was only for a short time between 2020 and 2025 that I participated, but I participated fully in the social media programming. I tried to mold myself into something that could go viral. I wasn&rsquo;t changing my message, but I did alter my priorities to feed the platforms before myself. I was convinced that I needed these platforms to find success.
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
