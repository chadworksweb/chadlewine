import type { Metadata } from "next";
import Link from "next/link";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient, getPlaybackMode } from "@/lib/supabase-server";
import HeroAnimatic from "@/app/hero-animatic/HeroAnimatic";
import { HomepageFeed } from "@/components/HomepageFeed";
import { GalleryWall, type GalleryPiece } from "@/components/GalleryWall";
import { FeedEntry } from "@/components/FeedEntry";
import { CelestialOrbit } from "@/components/CelestialOrbit";
import { MerchProductCard } from "@/components/MerchProductCard";
import { fetchBadge } from "@/lib/rising-compass";
import { getCuratedHeroItems } from "@/lib/homepage-hero";
import { getPreorderHeroSlide } from "@/lib/preorder-hero";

export const revalidate = 60;

const DEFAULT_METADATA: Metadata = {};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/", DEFAULT_METADATA);
}

async function getHomepageSongs() {
  const supabase = createPublicClient();

  // Latest 15 songs that have a manually-set release_date. This feeds the
  // homepage "Latest Songs" archive (15 entries); the hero-lens fallback is
  // capped separately in HomepageFeed so the slide count is unchanged. Songs
  // with no song-level date are intentionally excluded even if their album
  // has one — manual dates are the curation signal.
  const { data } = await supabase
    .from("songs")
    .select("id, title, slug, release_date, art_image_path, art_alt, hero_focal_x, hero_focal_y, hero_zoom, card_focal_x, card_focal_y, card_zoom, song_summary")
    .in("status", ["unreleased", "published"])
    .not("release_date", "is", null)
    .order("release_date", { ascending: false })
    .limit(15);

  const songs = data || [];
  if (songs.length === 0) return [];

  // Fetch each song's album cover + focal data so the homepage can fall back
  // to them when the song has no per-track art of its own. The album's own
  // hero/card focal columns are used when its cover is the chosen image —
  // the song's focal points would be wrong for a different image.
  const { data: junctions } = await supabase
    .from("release_songs")
    .select("song_id, release:releases(cover_art_path, cover_art_alt, hero_focal_x, hero_focal_y, hero_zoom, card_focal_x, card_focal_y, card_zoom)")
    .in("song_id", songs.map((s) => s.id));

  type AlbumFallback = {
    cover_art_path: string | null;
    cover_art_alt: string | null;
    hero_focal_x: number | null;
    hero_focal_y: number | null;
    hero_zoom: number | null;
    card_focal_x: number | null;
    card_focal_y: number | null;
    card_zoom: number | null;
  };
  const albumBySong: Record<string, AlbumFallback> = {};
  for (const j of (junctions || []) as Array<{ song_id: string; release: unknown }>) {
    const alb = Array.isArray(j.release) ? j.release[0] : j.release;
    if (alb && !albumBySong[j.song_id]) {
      albumBySong[j.song_id] = alb as AlbumFallback;
    }
  }

  return songs.map((s) => {
    const alb = albumBySong[s.id] ?? null;
    return {
      ...s,
      album_cover_path: alb?.cover_art_path ?? null,
      album_cover_alt: alb?.cover_art_alt ?? null,
      album_hero_focal_x: alb?.hero_focal_x ?? null,
      album_hero_focal_y: alb?.hero_focal_y ?? null,
      album_hero_zoom: alb?.hero_zoom ?? null,
      album_card_focal_x: alb?.card_focal_x ?? null,
      album_card_focal_y: alb?.card_focal_y ?? null,
      album_card_zoom: alb?.card_zoom ?? null,
    };
  });
}

async function getFeaturedTrack() {
  const supabase = createPublicClient();

  const { data: song } = await supabase
    .from("songs")
    .select("id, title, slug, duration_seconds, streaming_path, song_summary, playback_mode")
    .eq("featured", true)
    .limit(1)
    .maybeSingle();

  if (!song) return null;

  const { data: junction } = await supabase
    .from("release_songs")
    .select("track_number, release:releases(title, slug, cover_art_path, cover_art_alt)")
    .eq("song_id", song.id)
    .limit(1)
    .maybeSingle();

  if (!junction?.release) return null;

  const album = Array.isArray(junction.release) ? junction.release[0] : junction.release;

  return {
    song: { ...song, track_number: junction.track_number },
    album,
  };
}

async function getCLStreamSongs() {
  const supabase = createPublicClient();

  const { data } = await supabase
    .from("cl_stream_songs")
    .select("id, title, artist, album, note, source_url, created_at")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(5);

  const rows = data || [];
  // Live-fetch the badge per entry at render time. RC is authoritative for
  // tier/charge; chadlewine no longer stores a local copy.
  const badges = await Promise.all(
    rows.map((r) => fetchBadge(r.title, r.artist)),
  );
  return rows.map((r, i) => ({ ...r, badge: badges[i] }));
}

// Pull the opening sentence out of a post's HTML body for use as a feed lede.
function firstSentence(html: string | null): string {
  if (!html) return "";
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+([.!?,;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  const match = text.match(/^.*?[.!?](?=\s|$)/);
  return (match ? match[0] : text).trim();
}

// Combined "Latest Posts" feed: observations + journal entries interleaved by
// date, each tagged with its kind so the card can show a chip + link to the
// right section.
async function getLatestPosts() {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("posts")
    .select("id, title, slug, kind, date_captured, art_image_path, art_alt, hook_line, body")
    .eq("status", "published")
    .in("kind", ["observation", "journal"])
    .order("date_captured", { ascending: false })
    .limit(12);
  return ((data || []) as Array<{
    id: string;
    title: string;
    slug: string;
    kind: "observation" | "journal";
    date_captured: string | null;
    art_image_path: string | null;
    art_alt: string | null;
    hook_line: string | null;
    body: string | null;
  }>).map((p) => ({ ...p, lede: firstSentence(p.body) }));
}

async function getHomepageMerch() {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("merch")
    .select("id, slug, title, image_url, image_alt")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(6);
  return data || [];
}

/* Gallery-wall art for the homepage. Features pieces with measured width_in and
   height_in, so the wall hangs everything at true architectural scale. We pull a
   RANDOM 30 (rotates each ISR regen) rather than the whole catalogue, so the
   browser payload stays bounded and the client only scatters whatever fits. */
const GALLERY_WALL_POOL = 20;

async function getGalleryArt(): Promise<GalleryPiece[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("art_pieces")
    .select("id, slug, title, image_path, width_in, height_in, depth_in, medium, year_created")
    .in("status", ["unreleased", "published"])
    .not("width_in", "is", null)
    .not("height_in", "is", null);
  const all = (data as GalleryPiece[] | null) || [];
  // Fisher-Yates shuffle, then take the pool. (Server-side; fine at this scale.
  // Move to a DB-level `order by random() limit` via RPC if the catalogue ever
  // grows into the thousands.)
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, GALLERY_WALL_POOL);
}

// How many slides the hero shows. Curated pins lead; latest songs backfill the
// rest up to this number (see HomepageFeed). Stored in site_settings; defaults
// to 10 and is capped to what the song feed can backfill.
async function getHeroSlideCount(): Promise<number> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "hero_slide_count")
    .maybeSingle();
  const n = data?.value ? parseInt(data.value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(n, 15) : 10;
}

export default async function HomePage() {
  const [songs, featuredTrack, clStreamSongs, homepageMerch, curatedHeroItems, preorderHeroSlide, heroSlideCount, galleryArt, latestPosts] = await Promise.all([
    getHomepageSongs(),
    getFeaturedTrack(),
    getCLStreamSongs(),
    getHomepageMerch(),
    getCuratedHeroItems(),
    getPreorderHeroSlide(),
    getHeroSlideCount(),
    getGalleryArt(),
    getLatestPosts(),
  ]);

  // The Don't Blame Me pre-order leads the hero when it's live. It sits ahead
  // of the curated pins; the latest-songs backfill still fills the rest.
  const heroItems = preorderHeroSlide
    ? [preorderHeroSlide, ...curatedHeroItems]
    : curatedHeroItems;

  const featuredPlaybackMode = featuredTrack
    ? await getPlaybackMode(featuredTrack.song.playback_mode ?? null)
    : "preview" as const;

  return (
    <div id="page-home" className="page-home">
      {/* THE HERO. Full-bleed and a full screen tall, so this is the whole of
          the first view. It carries the page's h1 and the five doors as real
          links, and the existing feed follows directly below it, unchanged. */}
      <HeroAnimatic />
      {/* Zero-height scroll target for the hero's "enter homepage" anchor. The
          page-shell grid has no row-gap, so an empty child costs no space. */}
      <div id="home-enter" aria-hidden="true" />

      <HomepageFeed
        songs={songs}
        featuredTrack={featuredTrack ? { ...featuredTrack, playbackMode: featuredPlaybackMode } : null}
        clStreamSongs={clStreamSongs}
        curatedHeroItems={heroItems}
        heroSlideCount={heroSlideCount}
      />

      {homepageMerch.length > 0 && (
        <section className="home-merch">
          <div className="glyph-title-bar glyph-title-bar--top">
            <span className="glyph-title-bar__label" aria-hidden="true">░▒▓█</span>
            <h2 className="glyph-title-bar__heading">Shop Chad Lewine Merchandise</h2>
            <span className="glyph-title-bar__label" aria-hidden="true">█▓▒░</span>
          </div>
          <div className="home-merch__inner site-contain">
            <div className="home-merch__grid">
              {homepageMerch.map((p) => (
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
            <Link href="/merch" className="home-merch__view-all">View All Merch &rarr;</Link>
          </div>
        </section>
      )}

      {galleryArt.length > 0 && <GalleryWall pieces={galleryArt} />}

      {latestPosts.length > 0 && (
        <div className="home-split home-split--posts">
          <section className="home-split__observations">
            <h2 className="home-split__section-heading">Latest Posts</h2>
            <div className="archive__feed">
              {latestPosts.map((p) => {
                const isJournal = p.kind === "journal";
                const basePath = isJournal ? "/journal" : "/observations";
                return (
                  <div key={p.id} className="archive__feed-item">
                    <FeedEntry
                      title={p.title}
                      slug={p.slug}
                      dateCaptured={p.date_captured || undefined}
                      chipLabel={isJournal ? "Journal" : "Observation"}
                      chipTone={p.kind}
                      lede={p.lede}
                      artImageUrl={p.art_image_path || ""}
                      artAlt={p.art_alt || p.title}
                      href={`${basePath}/${p.slug}`}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          <div className="home-posts__orbit" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="home-posts__starfield" src="/celestial/dust-field.svg" alt="" />
            <CelestialOrbit idPrefix="home-posts" />
          </div>
        </div>
      )}

    </div>
  );
}
