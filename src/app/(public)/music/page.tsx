import type { Metadata } from "next";
import Link from "next/link";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient } from "@/lib/supabase-server";
import { AlbumHero, type AlbumHeroItem } from "@/components/AlbumHero";
import { ExploreSongs } from "@/components/ExploreSongs";
import { CurationGrid } from "@/components/CurationGrid";

export const revalidate = 60;

const DEFAULT_METADATA: Metadata = {
  title: "Music",
  description: "Music by Chad Lewine — discography, curated selections, and lyrics.",
  alternates: { canonical: "https://chadlewine.com/music" },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/music", DEFAULT_METADATA);
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
}

interface SongRow {
  id: string;
  title: string;
  slug: string;
  art_image_path: string | null;
  art_alt: string | null;
  song_summary: string | null;
  release_date: string | null;
  created_at: string;
}

interface AlbumJoinRow {
  song_id: string;
  album:
    | { title: string; slug: string; cover_art_path: string | null; cover_art_alt: string | null }
    | { title: string; slug: string; cover_art_path: string | null; cover_art_alt: string | null }[]
    | null;
}

interface CuratedRow {
  id: string;
  type: string;
  title: string;
  slug: string;
  artist_name: string;
  description: string | null;
  cover_image_path: string | null;
  rising_compass_score: number | null;
  rising_compass_classification: string | null;
  genre: string | null;
  mood_tags: string[] | null;
}

const HERO_ALBUM_LIMIT = 5;
const EXPLORE_SONG_LIMIT = 24;
const CURATION_LIMIT = 6;

export default async function MusicHubPage() {
  const supabase = createPublicClient();

  const [heroAlbumsRes, songsRes, curatedRes] = await Promise.all([
    supabase
      .from("albums")
      .select(
        "id, title, slug, release_date, cover_art_path, cover_art_alt, hero_focal_x, hero_focal_y, hero_zoom, card_focal_x, card_focal_y, card_zoom",
      )
      .eq("status", "published")
      .order("release_date", { ascending: false })
      .limit(HERO_ALBUM_LIMIT),
    supabase
      .from("songs")
      .select("id, title, slug, art_image_path, art_alt, song_summary, release_date, created_at")
      .eq("status", "published")
      .order("release_date", { ascending: false, nullsFirst: false })
      .limit(EXPLORE_SONG_LIMIT),
    supabase
      .from("curated_entries")
      .select(
        "id, type, title, slug, artist_name, description, cover_image_path, rising_compass_score, rising_compass_classification, genre, mood_tags",
      )
      .eq("status", "published")
      .order("display_order")
      .limit(CURATION_LIMIT),
  ]);

  const heroAlbums = (heroAlbumsRes.data || []) as AlbumRow[];
  const songs = (songsRes.data || []) as SongRow[];
  const curated = (curatedRes.data || []) as CuratedRow[];

  // Latest = newest published. Select = manual pick from site_settings, fall back to next-newest.
  const latest = heroAlbums[0] || null;

  const { data: selectSetting } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "music_hub_select_album_id")
    .maybeSingle();
  const selectedId = selectSetting?.value || null;

  let select: AlbumRow | null = null;
  if (selectedId) {
    const { data: pickedRows } = await supabase
      .from("albums")
      .select(
        "id, title, slug, release_date, cover_art_path, cover_art_alt, hero_focal_x, hero_focal_y, hero_zoom, card_focal_x, card_focal_y, card_zoom",
      )
      .eq("status", "published")
      .eq("id", selectedId)
      .limit(1);
    select = ((pickedRows || [])[0] || null) as AlbumRow | null;
  }
  if (!select) {
    select = heroAlbums.find((a) => !latest || a.id !== latest.id) || null;
  }

  // Discography mosaic — 4 covers, excluding the two cards above
  const excludeIds = [latest?.id, select?.id].filter(Boolean) as string[];
  let mosaicQuery = supabase
    .from("albums")
    .select("id, cover_art_path")
    .eq("status", "published")
    .not("cover_art_path", "is", null)
    .order("release_date", { ascending: false })
    .limit(4);
  if (excludeIds.length > 0) {
    mosaicQuery = mosaicQuery.not("id", "in", `(${excludeIds.join(",")})`);
  }
  const { data: mosaicRows } = await mosaicQuery;
  const mosaic = (mosaicRows || []).map((r) => r.cover_art_path).filter(Boolean) as string[];

  // ExploreSongs needs each song joined with its album for cover/title fallback
  const songIds = songs.map((s) => s.id);
  let albumBySong: Record<string, { title: string; slug: string; cover_art_path: string | null; cover_art_alt: string | null } | null> = {};
  if (songIds.length > 0) {
    const { data: junctions } = await supabase
      .from("album_songs")
      .select("song_id, album:albums(title, slug, cover_art_path, cover_art_alt)")
      .in("song_id", songIds);

    albumBySong = {};
    for (const j of (junctions || []) as AlbumJoinRow[]) {
      const alb = Array.isArray(j.album) ? j.album[0] : j.album;
      if (alb && !albumBySong[j.song_id]) {
        albumBySong[j.song_id] = alb;
      }
    }
  }

  const heroItems: AlbumHeroItem[] = heroAlbums
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

  const exploreSongs = songs.map((s) => ({
    id: s.id,
    title: s.title,
    slug: s.slug,
    song_summary: s.song_summary,
    art_image_path: s.art_image_path,
    art_alt: s.art_alt,
    album: albumBySong[s.id] || null,
  }));

  return (
    <>
      <section className="page-music-hub__banner">
        <div className="glyph-title-bar glyph-title-bar--top">
          <span className="glyph-title-bar__label" aria-hidden="true">░▒▓█</span>
          <h1 className="glyph-title-bar__heading">Music</h1>
          <span className="glyph-title-bar__label" aria-hidden="true">█▓▒░</span>
        </div>
      </section>

      <div id="page-music-hub" className="page-static">
        {heroItems.length > 0 && <AlbumHero items={heroItems} />}

      <div className="music-hub">
        <section className="music-hub__col">
          <h2 className="music-hub__heading">Latest</h2>
          {latest ? <AlbumCard album={latest} /> : <EmptyCard />}
        </section>

        <section className="music-hub__col">
          <h2 className="music-hub__heading">Select</h2>
          {select ? <AlbumCard album={select} /> : <EmptyCard />}
        </section>

        <section className="music-hub__col">
          <h2 className="music-hub__heading">Discography</h2>
          <Link href="/discography" className="music-hub__card-link">
            <div className="music-hub__mosaic" aria-hidden="true">
              {mosaic.length === 4 ? (
                mosaic.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt="" className="music-hub__mosaic-tile" loading="lazy" />
                ))
              ) : (
                <div className="music-hub__mosaic-empty" />
              )}
            </div>
            <div className="music-hub__card-info">
              <span className="music-hub__card-title">Browse All</span>
              <span className="music-hub__card-year">Full catalog →</span>
            </div>
          </Link>
        </section>
      </div>

      {exploreSongs.length > 0 && <ExploreSongs songs={exploreSongs} />}

      {curated.length > 0 && (
        <section className="page-music-hub__curation">
          <header className="page-music-hub__section-header">
            <h2 className="page-music-hub__section-heading">Curation</h2>
            <Link href="/curation" className="page-music-hub__section-more">
              See all curation →
            </Link>
          </header>
          <CurationGrid entries={curated} />
        </section>
      )}

        <div className="page-music-hub__cta-row">
          <Link href="/discography" className="page-music-hub__cta">
            Browse the full discography →
          </Link>
          <Link href="/music/songs" className="page-music-hub__cta">
            All songs →
          </Link>
        </div>
      </div>
    </>
  );
}

function AlbumCard({ album }: { album: AlbumRow }) {
  const year = album.release_date ? new Date(album.release_date).getFullYear() : null;
  return (
    <Link href={`/music/albums/${album.slug}`} className="music-hub__card-link">
      {album.cover_art_path ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={album.cover_art_path} alt={album.title} className="music-hub__cover" loading="lazy" />
      ) : (
        <div className="music-hub__cover music-hub__cover--empty" />
      )}
      <div className="music-hub__card-info">
        <span className="music-hub__card-title">{album.title}</span>
        {year && <span className="music-hub__card-year">{year}</span>}
      </div>
    </Link>
  );
}

function EmptyCard() {
  return (
    <div className="music-hub__card-link">
      <div className="music-hub__cover music-hub__cover--empty" />
      <div className="music-hub__card-info">
        <span className="music-hub__card-title">—</span>
      </div>
    </div>
  );
}
