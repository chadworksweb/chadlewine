import type { Metadata } from "next";
import Link from "next/link";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient, getPlaybackMode } from "@/lib/supabase-server";
import HeroAnimatic from "@/app/hero-animatic/HeroAnimatic";
import { HomepageFeed } from "@/components/HomepageFeed";
import { MotionInvite } from "@/components/MotionInvite";
import { GalleryWall, type GalleryPiece } from "@/components/GalleryWall";
import { FeedEntry } from "@/components/FeedEntry";
import { CelestialOrbit } from "@/components/CelestialOrbit";
import { MerchProductCard } from "@/components/MerchProductCard";
import { fetchBadge } from "@/lib/rising-compass";
import { getCuratedHeroItems } from "@/lib/homepage-hero";
import { getPreorderHeroSlide } from "@/lib/preorder-hero";

export const revalidate = 60;

// This page used to BE "/" and read the "/" page_meta row. At cutover the front
// page took "/" over, including that row, so the full site reads its own
// "/home" row instead. Canonical is declared here because the root layout's
// default canonical is the bare origin, which would point every crawl of
// /home back at the front page.
const DEFAULT_METADATA: Metadata = {
  alternates: { canonical: "https://chadlewine.com/home" },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/home", DEFAULT_METADATA);
}

// The album whose tracklist IS the homepage "Latest Songs" feed. Scoping the
// feed to one release is what lets the three pre-release singles sit in it
// alongside their album-mates: they kept their own true, earlier release
// dates (Turn The Mill really did come out in 2025), and a pure
// "newest 15 by date" query therefore pushed the title track below unrelated
// singles. Curation by album, ordering by date -- see the sort below.
const FEED_ALBUM_SLUG = "dont-blame-me";

interface FeedSong {
  id: string;
  title: string;
  slug: string;
  release_date: string | null;
  art_image_path: string | null;
  art_alt: string | null;
  hero_focal_x: number | null;
  hero_focal_y: number | null;
  hero_zoom: number | null;
  card_focal_x: number | null;
  card_focal_y: number | null;
  card_zoom: number | null;
  song_summary: string | null;
}

const SONG_FEED_COLUMNS =
  "id, title, slug, release_date, art_image_path, art_alt, hero_focal_x, hero_focal_y, hero_zoom, card_focal_x, card_focal_y, card_zoom, song_summary";

async function getHomepageSongs() {
  const supabase = createPublicClient();

  // The album is fetched for its cover art and focal points, which stand in for
  // every track that has none of its own — only two of the eleven do. Because
  // the feed IS this album, its sleeve is the right fallback for all of them.
  // (The previous version collected junction rows across every release a song
  // appeared on and kept whichever came back first, so a track that shipped as
  // a single could fall back to the single's sleeve instead of the album's.)
  const { data: album } = await supabase
    .from("releases")
    .select("id, cover_art_path, cover_art_alt, hero_focal_x, hero_focal_y, hero_zoom, card_focal_x, card_focal_y, card_zoom")
    .eq("slug", FEED_ALBUM_SLUG)
    .maybeSingle();

  if (!album) return [];

  // !inner so the status filter on the embedded song can drop the junction row
  // outright rather than leaving it with a null song attached.
  const { data: rows } = await supabase
    .from("release_songs")
    .select(`track_number, song:songs!inner(${SONG_FEED_COLUMNS})`)
    .eq("release_id", album.id)
    .in("song.status", ["unreleased", "published"]);

  const tracks = ((rows || []) as Array<{ track_number: number | null; song: unknown }>)
    .map((r) => ({
      // Sorted descending, so a missing track number belongs at the BOTTOM.
      // MIN_SAFE_INTEGER puts it there; 0 or a null would have led the feed.
      trackNumber: r.track_number ?? Number.MIN_SAFE_INTEGER,
      song: (Array.isArray(r.song) ? r.song[0] : r.song) as FeedSong | undefined,
    }))
    .filter((r): r is { trackNumber: number; song: FeedSong } => !!r.song)
    // REVERSE TRACKLIST: track 11 leads, track 1 closes. The eight tracks nobody
    // has heard yet come first and the three that already shipped as singles sit
    // at the bottom, which is the "newest first" the section heading promises
    // without letting dates decide anything.
    //
    // Ordering on track number ALONE also puts a real hazard permanently out of
    // reach. release_date is a DATE column with no time part and eight of the
    // eleven share the album's date, so any date-led sort leaves an eight-way
    // tie — and Postgres returns ties in whatever order it likes, which means
    // the feed reshuffles itself on every 60s revalidation. Track numbers are
    // unique, so there is nothing left to break.
    .sort((a, b) => b.trackNumber - a.trackNumber);

  return tracks.map(({ song }) => ({
    ...song,
    album_cover_path: album.cover_art_path ?? null,
    album_cover_alt: album.cover_art_alt ?? null,
    album_hero_focal_x: album.hero_focal_x ?? null,
    album_hero_focal_y: album.hero_focal_y ?? null,
    album_hero_zoom: album.hero_zoom ?? null,
    album_card_focal_x: album.card_focal_x ?? null,
    album_card_focal_y: album.card_focal_y ?? null,
    album_card_zoom: album.card_zoom ?? null,
  }));
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
    .select("id, slug, title, image_url, image_alt, is_new")
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

export default async function HomePage() {
  const [songs, featuredTrack, clStreamSongs, homepageMerch, curatedHeroItems, preorderHeroSlide, galleryArt, latestPosts] = await Promise.all([
    getHomepageSongs(),
    getFeaturedTrack(),
    getCLStreamSongs(),
    getHomepageMerch(),
    getCuratedHeroItems(),
    getPreorderHeroSlide(),
    getGalleryArt(),
    getLatestPosts(),
  ]);

  // The Don't Blame Me pre-order leads the hero when it's live, ahead of the
  // curated pins. This is the ONLY slide the hero shows that admin did not pin,
  // and it is self-gating: `getPreorderHeroSlide` returns null unless the
  // release still has a SKU at status "preorder", which it no longer does now
  // that the album is out. Everything after it is the pin list verbatim.
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
      {/* THE MOTION INVITE, and only here. A visitor whose OS asks for reduced
          motion gets the settled hero, which is correct, and on this page alone
          that means missing the thing the page opens with. Everywhere else the
          preference costs them nothing worth interrupting them about, so the
          invite does not follow them around the site. Renders nothing unless it
          applies. */}
      <MotionInvite />
      {/* Zero-height scroll target for the hero's "enter homepage" anchor. The
          page-shell grid has no row-gap, so an empty child costs no space. */}
      <div id="home-enter" aria-hidden="true" />

      <HomepageFeed
        songs={songs}
        featuredTrack={featuredTrack ? { ...featuredTrack, playbackMode: featuredPlaybackMode } : null}
        clStreamSongs={clStreamSongs}
        curatedHeroItems={heroItems}
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
                  isNew={p.is_new}
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
