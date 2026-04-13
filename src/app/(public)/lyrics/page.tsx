import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase-server";
import LyricBook from "@/components/LyricBook";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Lyrics — Chad Lewine",
  description: "Read lyrics from Chad Lewine's discography.",
  alternates: { canonical: "https://chadlewine.com/lyrics" },
};

export default async function LyricsPage() {
  const supabase = createPublicClient();

  // Albums — reverse chronological
  const { data: albumRows } = await supabase
    .from("albums")
    .select("id, title, slug, release_date")
    .eq("status", "published")
    .order("release_date", { ascending: false });

  // Album-song junctions
  const { data: junctions } = await supabase
    .from("album_songs")
    .select("album_id, track_number, song:songs(id, title, slug, lyrics, status)")
    .order("track_number");

  // IDs of songs that belong to an album
  const albumSongIds = new Set(
    (junctions || []).map((j: any) => j.song?.id).filter(Boolean)
  );

  // Singles = published songs with lyrics that aren't in any album
  const { data: allSongs } = await supabase
    .from("songs")
    .select("id, title, slug, lyrics, status, created_at")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  const singles = (allSongs || [])
    .filter((s: any) => s.lyrics && !albumSongIds.has(s.id))
    .map((s: any, i: number) => ({
      id: s.id,
      album_id: "__singles__",
      title: s.title,
      slug: s.slug,
      track_number: i + 1,
      lyrics: s.lyrics,
    }));

  const albums = (albumRows || []).map((a: any) => ({
    id: a.id,
    title: a.title,
    slug: a.slug,
    release_year: a.release_date
      ? new Date(a.release_date).getFullYear().toString()
      : undefined,
  }));

  const albumSongs = (junctions || [])
    .filter((j: any) => j.song?.status === "published" && j.song?.lyrics)
    .map((j: any) => ({
      id: j.song.id,
      album_id: j.album_id,
      title: j.song.title,
      slug: j.song.slug,
      track_number: j.track_number,
      lyrics: j.song.lyrics,
    }));

  return (
    <LyricBook
      albums={albums}
      songs={albumSongs}
      singles={singles}
    />
  );
}
