import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient, getPlaybackMode } from "@/lib/supabase-server";
import { HomepageFeed } from "@/components/HomepageFeed";
import { ExploreSongs } from "@/components/ExploreSongs";
import { SongBriefCard, type SongBriefData } from "@/components/SongBriefCard";
import { fetchBadge } from "@/lib/rising-compass";

export const revalidate = 60;

const DEFAULT_METADATA: Metadata = {};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/", DEFAULT_METADATA);
}

async function getHomepageSongs() {
  const supabase = createPublicClient();

  const { data } = await supabase
    .from("songs")
    .select("id, title, slug, release_date, art_image_path, art_alt, hero_focal_x, hero_focal_y, hero_zoom, card_focal_x, card_focal_y, card_zoom, song_summary")
    .in("status", ["unreleased", "published"])
    .order("release_date", { ascending: false, nullsFirst: false })
    .limit(10);

  return data || [];
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
    .from("album_songs")
    .select("track_number, album:albums(title, slug, cover_art_path, cover_art_alt)")
    .eq("song_id", song.id)
    .limit(1)
    .maybeSingle();

  if (!junction?.album) return null;

  const album = Array.isArray(junction.album) ? junction.album[0] : junction.album;

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

  const { data: songs } = await supabase
    .from("songs")
    .select("id, slug, title, song_summary, chorus, chad_quote, art_image_path, art_alt")
    .in("status", ["unreleased", "published"])
    .order("release_date", { ascending: false, nullsFirst: false })
    .limit(9);

  if (!songs || songs.length === 0) return [];

  const ids = songs.map((s) => s.id);

  const [{ data: junctions }, { data: sections }] = await Promise.all([
    supabase
      .from("album_songs")
      .select("song_id, album:albums(title, slug)")
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
    const alb = Array.isArray((j as any).album) ? (j as any).album[0] : (j as any).album;
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
    const { data } = await supabase
      .from("songs")
      .select("id, title, slug, song_summary, art_image_path, art_alt")
      .eq("status", "published");
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
    .from("album_songs")
    .select("song_id, album:albums(title, slug, cover_art_path, cover_art_alt)")
    .in("song_id", songIds);

  const albumBySong: Record<string, { title: string; slug: string; cover_art_path: string | null; cover_art_alt: string | null } | null> = {};
  for (const j of junctions || []) {
    const alb = Array.isArray((j as any).album) ? (j as any).album[0] : (j as any).album;
    if (alb && !albumBySong[j.song_id]) albumBySong[j.song_id] = alb;
  }

  return songs.map((s) => ({
    ...s,
    album: albumBySong[s.id] || null,
  }));
}

export default async function HomePage() {
  const [songs, featuredTrack, clStreamSongs, exploreSongs, songBriefs] = await Promise.all([
    getHomepageSongs(),
    getFeaturedTrack(),
    getCLStreamSongs(),
    getExploreSongs(),
    getSongBriefs(),
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
      />

      <ExploreSongs songs={exploreSongs} />

      {songBriefs.length > 0 && (
        <section className="song-brief-feed">
          <div className="song-brief-feed__inner">
            <h2 className="song-brief-feed__heading">Explore Chad Lewine Songs</h2>
            <div className="song-brief-feed__grid">
              {songBriefs.map((s) => (
                <SongBriefCard key={s.id} song={s} />
              ))}
            </div>
          </div>
        </section>
      )}

      {!process.env.VERCEL && (
        <section className="home-merch">
          <div className="home-merch__inner site-contain">
            <h2 className="home-merch__heading">Chad Lewine Merch</h2>
            <div className="home-merch__grid">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="home-merch__card">
                  <div className="home-merch__img" />
                  <span className="home-merch__title">Product {n}</span>
                  <span className="home-merch__price">$—</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

    </div>
  );
}
