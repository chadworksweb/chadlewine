import type { Metadata } from "next";
import Link from "next/link";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient, getPlaybackMode } from "@/lib/supabase-server";
import { HomepageFeed } from "@/components/HomepageFeed";
import { ExploreSongs } from "@/components/ExploreSongs";
import { SongBriefCard, type SongBriefData } from "@/components/SongBriefCard";
import { MerchProductCard } from "@/components/MerchProductCard";
import { fetchBadge } from "@/lib/rising-compass";
import { getCuratedHeroItems } from "@/lib/homepage-hero";

export const revalidate = 60;

// Album slugs whose songs are excluded from the homepage "Browse Songs"
// coverflow (ExploreSongs) and the song-brief feed. Singles pages and the
// full /music index still surface these — this is curation, not deletion.
const BROWSE_EXCLUDED_ALBUM_SLUGS = ["demoesque"];

async function getBrowseExcludedSongIds(
  supabase: ReturnType<typeof createPublicClient>,
): Promise<string[]> {
  if (BROWSE_EXCLUDED_ALBUM_SLUGS.length === 0) return [];
  const { data: albums } = await supabase
    .from("releases")
    .select("id")
    .in("slug", BROWSE_EXCLUDED_ALBUM_SLUGS);
  const albumIds = ((albums || []) as { id: string }[]).map((a) => a.id);
  if (albumIds.length === 0) return [];
  const { data: junctions } = await supabase
    .from("release_songs")
    .select("song_id")
    .in("release_id", albumIds);
  return ((junctions || []) as { song_id: string }[]).map((j) => j.song_id);
}

const DEFAULT_METADATA: Metadata = {};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/", DEFAULT_METADATA);
}

async function getHomepageSongs() {
  const supabase = createPublicClient();

  // Latest 10 songs that have a manually-set release_date. The hero lens
  // intentionally excludes songs with no song-level date even if their
  // album has one — manual dates are the curation signal.
  const { data } = await supabase
    .from("songs")
    .select("id, title, slug, release_date, art_image_path, art_alt, hero_focal_x, hero_focal_y, hero_zoom, card_focal_x, card_focal_y, card_zoom, song_summary")
    .in("status", ["unreleased", "published"])
    .not("release_date", "is", null)
    .order("release_date", { ascending: false })
    .limit(10);

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

async function getSongBriefs(): Promise<SongBriefData[]> {
  const supabase = createPublicClient();

  const excludedIds = await getBrowseExcludedSongIds(supabase);

  let query = supabase
    .from("songs")
    .select("id, slug, title, song_summary, chorus, chad_quote, art_image_path, art_alt")
    .in("status", ["unreleased", "published"]);
  if (excludedIds.length > 0) {
    query = query.not("id", "in", `(${excludedIds.join(",")})`);
  }
  const { data: songs } = await query
    .order("release_date", { ascending: false, nullsFirst: false })
    .limit(9);

  if (!songs || songs.length === 0) return [];

  const ids = songs.map((s) => s.id);

  const [{ data: junctions }, { data: sections }] = await Promise.all([
    supabase
      .from("release_songs")
      .select("song_id, release:releases(title, slug)")
      .in("song_id", ids),
    supabase
      .from("song_visibility_sections")
      .select("song_id, category, direct_answer, content, key_points, display_order")
      .in("song_id", ids)
      .eq("status", "published")
      .order("display_order", { ascending: true }),
  ]);

  const albumBySong: Record<string, { title: string; slug: string } | null> = {};
  for (const j of junctions || []) {
    const alb = Array.isArray((j as any).release) ? (j as any).release[0] : (j as any).release;
    if (alb && !albumBySong[j.song_id]) albumBySong[j.song_id] = alb;
  }

  const stripMarkdown = (line: string) =>
    line
      .replace(/^[-*+]\s+/, "")
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .trim();

  const extractHookLines = (content: string | null | undefined): string[] => {
    if (!content) return [];
    const out: string[] = [];
    for (const raw of content.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) continue;
      if (/^\*\*[^*]+\*\*$/.test(line)) continue;
      if (/^#{1,6}\s/.test(line)) continue;
      if (/^[-=*_]{3,}$/.test(line)) continue;
      const cleaned = stripMarkdown(line);
      if (cleaned.length < 3) continue;
      out.push(cleaned);
    }
    return out;
  };

  const hooksBySong: Record<string, string[]> = {};
  for (const s of sections || []) {
    if (s.category !== "hooks") continue;
    let pts: string[] = [];
    if (Array.isArray(s.key_points)) {
      pts = s.key_points.map((p: string) => stripMarkdown(p)).filter((p) => p.length >= 3);
    }
    if (pts.length === 0) pts = extractHookLines(s.content);
    if (pts.length > 0) hooksBySong[s.song_id] = pts;
  }

  return songs.map((s) => ({
    id: s.id,
    slug: s.slug,
    title: s.title,
    song_summary: s.song_summary,
    chorus: s.chorus,
    chad_quote: s.chad_quote,
    art_image_path: s.art_image_path,
    art_alt: s.art_alt,
    album: albumBySong[s.id] || null,
    hooks: hooksBySong[s.id] || [],
  }));
}

async function getHomepageMerch() {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("products")
    .select("id, slug, title, image_url, image_alt")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(6);
  return data || [];
}

async function getExploreSongs() {
  const supabase = createPublicClient();

  const { data: settings } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", ["homepage_explore_songs_mode", "homepage_explore_songs_ids"]);

  const smap: Record<string, string> = {};
  for (const s of settings || []) smap[s.key] = s.value;
  const mode = smap.homepage_explore_songs_mode || "random";

  let songs: {
    id: string;
    title: string;
    slug: string;
    song_summary: string | null;
    art_image_path: string | null;
    art_alt: string | null;
  }[] = [];

  if (mode === "manual") {
    let ids: string[] = [];
    try { ids = JSON.parse(smap.homepage_explore_songs_ids || "[]"); } catch {}
    if (ids.length === 0) return [];
    const { data } = await supabase
      .from("songs")
      .select("id, title, slug, song_summary, art_image_path, art_alt")
      .eq("status", "published")
      .in("id", ids);
    const byId = new Map((data || []).map((s) => [s.id, s]));
    songs = ids.map((id) => byId.get(id)).filter(Boolean) as typeof songs;
  } else {
    const excludedIds = await getBrowseExcludedSongIds(supabase);
    let query = supabase
      .from("songs")
      .select("id, title, slug, song_summary, art_image_path, art_alt")
      .eq("status", "published");
    if (excludedIds.length > 0) {
      query = query.not("id", "in", `(${excludedIds.join(",")})`);
    }
    const { data } = await query;
    const pool = data || [];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    songs = pool.slice(0, 20);
  }

  if (songs.length === 0) return [];

  const songIds = songs.map((s) => s.id);
  const { data: junctions } = await supabase
    .from("release_songs")
    .select("song_id, release:releases(title, slug, cover_art_path, cover_art_alt)")
    .in("song_id", songIds);

  const albumBySong: Record<string, { title: string; slug: string; cover_art_path: string | null; cover_art_alt: string | null } | null> = {};
  for (const j of junctions || []) {
    const alb = Array.isArray((j as any).release) ? (j as any).release[0] : (j as any).release;
    if (alb && !albumBySong[j.song_id]) albumBySong[j.song_id] = alb;
  }

  return songs.map((s) => ({
    ...s,
    album: albumBySong[s.id] || null,
  }));
}

export default async function HomePage() {
  const [songs, featuredTrack, clStreamSongs, exploreSongs, songBriefs, homepageMerch, curatedHeroItems] = await Promise.all([
    getHomepageSongs(),
    getFeaturedTrack(),
    getCLStreamSongs(),
    getExploreSongs(),
    getSongBriefs(),
    getHomepageMerch(),
    getCuratedHeroItems(),
  ]);

  const featuredPlaybackMode = featuredTrack
    ? await getPlaybackMode(featuredTrack.song.playback_mode ?? null)
    : "preview" as const;

  return (
    <div id="page-home" className="page-home">
      <HomepageFeed
        songs={songs}
        featuredTrack={featuredTrack ? { ...featuredTrack, playbackMode: featuredPlaybackMode } : null}
        clStreamSongs={clStreamSongs}
        curatedHeroItems={curatedHeroItems}
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

      <ExploreSongs songs={exploreSongs} />

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
  );
}
