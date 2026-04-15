import Link from "next/link";
import { createPublicClient, getPlaybackMode } from "@/lib/supabase-server";
import { HomepageFeed } from "@/components/HomepageFeed";
import { ExploreSongs } from "@/components/ExploreSongs";

export const revalidate = 60;

async function getObservations() {
  const supabase = createPublicClient();

  const { data: observations } = await supabase
    .from("observations")
    .select("id, title, slug, date_captured, art_image_path, art_alt, hook_line, status")
    .eq("status", "published")
    .order("date_captured", { ascending: false });

  if (!observations || observations.length === 0) return [];

  // Fetch categories and tags for all observations
  const ids = observations.map((o) => o.id);

  const [{ data: catLinks }, { data: tagLinks }] = await Promise.all([
    supabase
      .from("observation_categories")
      .select("observation_id, categories(title, slug)")
      .in("observation_id", ids),
    supabase
      .from("observation_tags")
      .select("observation_id, tags(label, slug)")
      .in("observation_id", ids),
  ]);

  const catMap: Record<string, { title: string; slug: string }[]> = {};
  for (const link of catLinks || []) {
    const cat = (link as any).categories;
    if (!cat) continue;
    (catMap[link.observation_id] ||= []).push(cat);
  }

  const tagMap: Record<string, { label: string; slug: string }[]> = {};
  for (const link of tagLinks || []) {
    const tag = (link as any).tags;
    if (!tag) continue;
    (tagMap[link.observation_id] ||= []).push(tag);
  }

  return observations.map((o) => ({
    ...o,
    categories: catMap[o.id] || [],
    tags: tagMap[o.id] || [],
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

  // Get album via junction
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

async function getMeditations() {
  const supabase = createPublicClient();

  const { data: meditations } = await supabase
    .from("meditations")
    .select("id, subtitle, body, plain_text, published_at, created_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(10);

  return meditations || [];
}

export default async function HomePage() {
  const [observations, meditations, featuredTrack, exploreSongs] = await Promise.all([
    getObservations(),
    getMeditations(),
    getFeaturedTrack(),
    getExploreSongs(),
  ]);

  const featuredPlaybackMode = featuredTrack
    ? await getPlaybackMode(featuredTrack.song.playback_mode ?? null)
    : "preview" as const;

  return (
    <div id="page-home" className="page-home">
      <HomepageFeed
        observations={observations}
        featuredTrack={featuredTrack ? { ...featuredTrack, playbackMode: featuredPlaybackMode } : null}
        meditations={meditations}
      />

      <ExploreSongs songs={exploreSongs} />

      {!process.env.VERCEL && (
        <section className="home-merch">
          <div className="home-merch__inner site-contain">
            <h2 className="home-merch__heading">Most Popular Merch</h2>
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

      {observations.length === 0 && (
        <section className="empty-state">
          <p className="empty-state__message">No observations published yet.</p>
        </section>
      )}
    </div>
  );
}
