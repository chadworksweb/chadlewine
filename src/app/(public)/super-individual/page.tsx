import type { Metadata } from "next";
import Link from "next/link";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient } from "@/lib/supabase-server";
import { Prompt } from "@/components/Prompt";
import { SuperIndividualMerchCarousel, type CarouselProduct } from "@/components/SuperIndividualMerchCarousel";
import { AlbumHero, type AlbumHeroItem } from "@/components/AlbumHero";
import { DiscographyCubeRadiant, type DiscographyCubeFace } from "@/components/DiscographyCubeRadiant";
import { RCNowPlayingTile } from "@/components/RCNowPlayingTile";
import { MiniLyricalCharger } from "@/components/MiniLyricalCharger";
import { SuperIndividualPopupSection } from "@/components/SuperIndividualPopup";

export const revalidate = 60;

const DEFAULT_METADATA: Metadata = {
  title: "Super Individual — Take Back Your Power — Chad Lewine",
  description:
    "Take back your power. Chad Lewine's Super Individual Series — the wearable thesis. Withdraw from institutional modernity, starting with your soundtrack.",
  alternates: { canonical: "https://chadlewine.com/super-individual" },
  openGraph: {
    title: "Super Individual — Chad Lewine",
    description:
      "Take back your power. Chad Lewine's Super Individual Series.",
    url: "https://chadlewine.com/super-individual",
  },
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
        "id, title, slug, release_date, art_image_path, art_alt, is_single, card_focal_x, card_focal_y, card_zoom"
      )
      .eq("status", "published")
      .eq("is_single", true)
      .order("release_date", { ascending: false }),
  ]);

  const albums = (albumsRes.data || []) as AlbumRow[];
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
    for (const j of junctions || []) {
      const songId = (j as { song_id: string }).song_id;
      const alb = Array.isArray((j as { album: unknown }).album)
        ? (j as { album: Array<{ cover_art_path: string | null; cover_art_alt: string | null }> }).album[0]
        : (j as { album: { cover_art_path: string | null; cover_art_alt: string | null } | null }).album;
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
      focalX: a.card_focal_x != null ? a.card_focal_x / 100 : 0.5,
      focalY: a.card_focal_y != null ? a.card_focal_y / 100 : 0.5,
      zoom: a.card_zoom != null && a.card_zoom >= 1 ? a.card_zoom : 1,
    }));

  const heroFromSingles: AlbumHeroItem[] = singles
    .map((s) => {
      const cover = s.art_image_path || albumArtBySong[s.id]?.cover_art_path || null;
      const alt = s.art_alt || albumArtBySong[s.id]?.cover_art_alt || s.title;
      if (!cover) return null;
      return {
        slug: s.slug,
        title: s.title,
        releaseDate: s.release_date,
        artImagePath: cover,
        artAlt: alt,
        href: `/music/songs/${s.slug}`,
        ctaLabel: "Listen →",
        focalX: s.card_focal_x != null ? s.card_focal_x / 100 : 0.5,
        focalY: s.card_focal_y != null ? s.card_focal_y / 100 : 0.5,
        zoom: s.card_zoom != null && s.card_zoom >= 1 ? s.card_zoom : 1,
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
      {/* Section 1 — Hero */}
      <section className="si-hero" aria-label="Super Individual">
        <div className="si-hero__inner">
          <h1 className="si-hero__headline">Take back your power.</h1>
          <p className="si-hero__sub">Chad Lewine's Super Individual Series.</p>
          <div className="si-hero__nav">
            <a href="#what" className="si-hero__nav-link">What is a Super Individual?</a>
            <a href="#thesis" className="si-hero__nav-link">The Thesis</a>
            <a href="#doors" className="si-hero__nav-link">Three Doors</a>
            <a href="#popup" className="si-hero__nav-link">The Pop-Up</a>
          </div>
        </div>
      </section>

      {/* Section 2 — What is a Super Individual? */}
      <section className="si-section" id="what" aria-labelledby="si-what-heading">
        <div className="explore-songs__frame explore-songs__frame--top">
          <span className="explore-songs__frame-label" aria-hidden="true">░▒▓█</span>
          <h2 className="explore-songs__heading" id="si-what-heading">
            What is a Super Individual?
          </h2>
          <span className="explore-songs__frame-label" aria-hidden="true">█▓▒░</span>
        </div>
        <div className="si-section__inner">
          <Prompt label="Definition body">
            Two-to-three short paragraphs.
            <br /><br />
            Para 1: Name the AI-era origin. The phrase is borrowed from the AI conversation, where it means one person now capable of producing what used to take a team and months. Credit it openly.
            <br /><br />
            Para 2: Expand past tech into life itself. Humans doing exponentially more with new tools — and the new tool isn't only AI. The deeper tool is awareness: realizing your power is being drained, sensing it, stopping it, taking it back.
            <br /><br />
            Para 3 (optional): One sentence claiming the word for the bigger meaning. The Super Individual is the sovereign, empowered being. Voice: declarative, calm, no hype.
          </Prompt>
        </div>
      </section>

      {/* Section 3 — The Thesis */}
      <section className="si-section" id="thesis" aria-labelledby="si-thesis-heading">
        <div className="explore-songs__frame explore-songs__frame--top">
          <span className="explore-songs__frame-label" aria-hidden="true">░▒▓█</span>
          <h2 className="explore-songs__heading" id="si-thesis-heading">
            Take back your power starts with your soundtrack.
          </h2>
          <span className="explore-songs__frame-label" aria-hidden="true">█▓▒░</span>
        </div>
        <div className="si-section__inner">
          <Prompt label="Thesis body">
            Two short paragraphs.
            <br /><br />
            Para 1: The institution being escaped is the modern recorded music business. Name it specifically. Why this institution drains you, and how the drain is invisible until you measure it.
            <br /><br />
            Para 2: The bridge to the three doors below. Three ways in, in order of depth: wear the clothes (the Series), listen to the music, test what you already listen to with the Rising Compass. Same message, three on-ramps.
          </Prompt>
        </div>
      </section>

      {/* ============ THREE DOORS ============ */}
      <div id="doors" />

      {/* Door 1 — Merch */}
      <section className="si-door si-door--merch" aria-labelledby="si-door-merch-heading">
        <div className="explore-songs__frame explore-songs__frame--top">
          <span className="explore-songs__frame-label" aria-hidden="true">░▒▓█</span>
          <h2 className="explore-songs__heading" id="si-door-merch-heading">
            Door 1 — Wear the clothes.
          </h2>
          <span className="explore-songs__frame-label" aria-hidden="true">█▓▒░</span>
        </div>

        <div className="si-door__intro">
          <Prompt label="Merch door framing">
            Two short paragraphs. The wearable thesis: a stranger buys the hoodie because the idea resonates, not because they're a Chad fan. The hoodie distributes the message through a body, in a city you've never been to. Trojan horse logic. Close with the carousel CTA — every piece is below.
          </Prompt>
        </div>

        {merch.length > 0 ? (
          <div className="si-door__merch-stage">
            <SuperIndividualMerchCarousel products={merch} />
          </div>
        ) : (
          <div className="si-door__empty">
            <p>The Series collection is being assembled. Check back shortly.</p>
            <Link href="/merch" className="si-door__cta">Browse all merch →</Link>
          </div>
        )}
      </section>

      {/* Door 2 — Music (HeroLens + Discography 4-up) */}
      <section className="si-door si-door--music" aria-labelledby="si-door-music-heading">
        <div className="explore-songs__frame explore-songs__frame--top">
          <span className="explore-songs__frame-label" aria-hidden="true">░▒▓█</span>
          <h2 className="explore-songs__heading" id="si-door-music-heading">
            Door 2 — Listen to the catalog.
          </h2>
          <span className="explore-songs__frame-label" aria-hidden="true">█▓▒░</span>
        </div>

        <div className="si-door__intro">
          <Prompt label="Music door framing">
            Two short paragraphs. The catalog as the message — the song is the atomic unit, not the post. Albums, EPs, singles, compilations all carry the thesis somewhere different. Voice: artist patron register. Close with the coverflow CTA: pick one and start.
          </Prompt>
        </div>

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

        {heroItems.length > 0 && (
          <>
            <div className="explore-songs__frame explore-songs__frame--top si-frame--sub">
              <span className="explore-songs__frame-label" aria-hidden="true">░▒▓█</span>
              <h3 className="explore-songs__heading">Coverflow</h3>
              <span className="explore-songs__frame-label" aria-hidden="true">█▓▒░</span>
            </div>
            <div className="si-door__album-hero">
              <AlbumHero items={heroItems} />
            </div>
          </>
        )}

        <div className="si-door__footer">
          <Link href="/music" className="si-door__cta">Open the Music hub →</Link>
          <Link href="/discography" className="si-door__cta">See the full discography →</Link>
        </div>
      </section>

      {/* Door 3 — Rising Compass */}
      <section className="si-door si-door--rc" aria-labelledby="si-door-rc-heading">
        <div className="explore-songs__frame explore-songs__frame--top">
          <span className="explore-songs__frame-label" aria-hidden="true">░▒▓█</span>
          <h2 className="explore-songs__heading" id="si-door-rc-heading">
            Door 3 — Test your music. Then pass it on.
          </h2>
          <span className="explore-songs__frame-label" aria-hidden="true">█▓▒░</span>
        </div>

        <div className="si-door__intro">
          <Prompt label="Rising Compass framing">
            Two short paragraphs. The Rising Compass is the diagnostic to measure what your soundtrack is doing to your psyche. The institution being measured is the modern recorded music business — every song carries a frequency, and most of the chart is doing something to you you didn't consent to. Voice: structural / consciousness register. Lead the reader straight to the inline tool below.
          </Prompt>
        </div>

        <div className="si-door__rc-grid">
          <div className="si-door__rc-tile">
            <RCNowPlayingTile />
          </div>
          <div className="si-door__rc-charger">
            <h3 className="si-door__rc-charger-heading">
              Read any song&rsquo;s frequency
            </h3>
            <p className="si-door__rc-charger-sub">
              Paste the lyrics. The Rising Compass calibration engine reads the frequency it carries.
            </p>
            <MiniLyricalCharger />
          </div>
        </div>
      </section>

      {/* Section 5 — The Pop-Up (capstone, end of page) */}
      <SuperIndividualPopupSection />
    </div>
  );
}
