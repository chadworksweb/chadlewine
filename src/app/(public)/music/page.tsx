import type { Metadata } from "next";
import Link from "next/link";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient } from "@/lib/supabase-server";
import { ReleaseHero, type ReleaseHeroItem } from "@/components/ReleaseHero";
import { ExploreSongs } from "@/components/ExploreSongs";
import { CurationGrid } from "@/components/CurationGrid";
import { SongBriefCard } from "@/components/SongBriefCard";
import { getSongBriefs } from "@/lib/song-briefs";

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

interface ReleaseJoinRow {
  song_id: string;
  release:
    | { title: string; slug: string; cover_art_path: string | null; cover_art_alt: string | null; release_type: string | null }
    | { title: string; slug: string; cover_art_path: string | null; cover_art_alt: string | null; release_type: string | null }[]
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

  const [heroAlbumsRes, songsRes, curatedRes, songBriefs] = await Promise.all([
    supabase
      .from("releases")
      .select(
        "id, title, slug, release_date, cover_art_path, cover_art_alt, hero_focal_x, hero_focal_y, hero_zoom, card_focal_x, card_focal_y, card_zoom",
      )
      .eq("status", "published")
      .neq("release_type", "single")
      .order("release_date", { ascending: false })
      .limit(HERO_ALBUM_LIMIT),
    supabase
      .from("songs")
      .select("id, title, slug, art_image_path, art_alt, song_summary, release_date, created_at")
      .eq("status", "published")
      .neq("instrumental", true)
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
    getSongBriefs(),
  ]);

  const heroAlbums = (heroAlbumsRes.data || []) as AlbumRow[];
  const songs = (songsRes.data || []) as SongRow[];
  const curated = (curatedRes.data || []) as CuratedRow[];

  // ExploreSongs needs each song joined with its album for cover/title fallback
  const songIds = songs.map((s) => s.id);
  let albumBySong: Record<string, { title: string; slug: string; cover_art_path: string | null; cover_art_alt: string | null } | null> = {};
  if (songIds.length > 0) {
    const { data: junctions } = await supabase
      .from("release_songs")
      .select("song_id, release:releases(title, slug, cover_art_path, cover_art_alt, release_type)")
      .in("song_id", songIds);

    albumBySong = {};
    for (const j of (junctions || []) as ReleaseJoinRow[]) {
      const alb = Array.isArray(j.release) ? j.release[0] : j.release;
      // Skip single-type releases: a single's song has no public "album", so
      // it must not surface a "from [release]" link to the redirected page.
      if (alb && alb.release_type !== "single" && !albumBySong[j.song_id]) {
        albumBySong[j.song_id] = alb;
      }
    }
  }

  const heroItems: ReleaseHeroItem[] = heroAlbums
    .filter((a) => a.cover_art_path)
    .map((a) => ({
      slug: a.slug,
      title: a.title,
      releaseDate: a.release_date,
      artImagePath: a.cover_art_path || "",
      artAlt: a.cover_art_alt || a.title,
      href: `/music/releases/${a.slug}`,
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
        {heroItems.length > 0 && <ReleaseHero items={heroItems} />}

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

      {songBriefs.length > 0 && (
        <section className="song-brief-feed">
          <div className="glyph-title-bar glyph-title-bar--top">
            <span className="glyph-title-bar__label" aria-hidden="true">░▒▓█</span>
            <h2 className="glyph-title-bar__heading">Read About Chad Lewine Songs</h2>
            <span className="glyph-title-bar__label" aria-hidden="true">█▓▒░</span>
          </div>
          <div className="song-brief-feed__inner">
            <div className="song-brief-feed__grid">
              {songBriefs.map((s) => (
                <SongBriefCard key={s.id} song={s} />
              ))}
            </div>
          </div>
        </section>
      )}

      </div>
    </>
  );
}

