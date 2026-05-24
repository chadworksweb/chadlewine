import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase-server";

// Always recompute a fresh random set — this backs the coverflow's
// "Shuffle More Songs" button. Mirrors the random branch of getExploreSongs()
// in the homepage server component.
export const dynamic = "force-dynamic";

const BROWSE_EXCLUDED_ALBUM_SLUGS = ["demoesque"];

interface ExploreSongRow {
  id: string;
  title: string;
  slug: string;
  song_summary: string | null;
  art_image_path: string | null;
  art_alt: string | null;
}

type ReleaseLite = {
  title: string;
  slug: string;
  cover_art_path: string | null;
  cover_art_alt: string | null;
};

export async function GET() {
  const supabase = createPublicClient();

  // Songs belonging to browse-excluded albums (curation, not deletion).
  let excludedIds: string[] = [];
  const { data: albums } = await supabase
    .from("releases")
    .select("id")
    .in("slug", BROWSE_EXCLUDED_ALBUM_SLUGS);
  const albumIds = ((albums || []) as { id: string }[]).map((a) => a.id);
  if (albumIds.length > 0) {
    const { data: junctions } = await supabase
      .from("release_songs")
      .select("song_id")
      .in("release_id", albumIds);
    excludedIds = ((junctions || []) as { song_id: string }[]).map((j) => j.song_id);
  }

  let query = supabase
    .from("songs")
    .select("id, title, slug, song_summary, art_image_path, art_alt")
    .eq("status", "published");
  if (excludedIds.length > 0) {
    query = query.not("id", "in", `(${excludedIds.join(",")})`);
  }
  const { data } = await query;

  const pool = (data || []) as ExploreSongRow[];
  // Fisher-Yates shuffle, then take 20.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const songs = pool.slice(0, 20);
  if (songs.length === 0) return NextResponse.json({ songs: [] });

  const songIds = songs.map((s) => s.id);
  const { data: jx } = await supabase
    .from("release_songs")
    .select("song_id, release:releases(title, slug, cover_art_path, cover_art_alt)")
    .in("song_id", songIds);

  type JunctionRow = { song_id: string; release: ReleaseLite | ReleaseLite[] | null };
  const albumBySong: Record<string, ReleaseLite | null> = {};
  for (const j of (jx || []) as JunctionRow[]) {
    const alb = Array.isArray(j.release) ? j.release[0] : j.release;
    if (alb && !albumBySong[j.song_id]) albumBySong[j.song_id] = alb;
  }

  const result = songs.map((s) => ({ ...s, album: albumBySong[s.id] || null }));
  return NextResponse.json({ songs: result });
}
