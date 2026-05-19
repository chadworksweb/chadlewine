import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient } from "@/lib/supabase-server";
import LyricBook from "@/components/LyricBook";

export const revalidate = 60;

const DEFAULT_METADATA: Metadata = {
  title: "Lyrics",
  description: "Read lyrics from Chad Lewine's discography.",
  alternates: { canonical: "https://chadlewine.com/lyrics" },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/lyrics", DEFAULT_METADATA);
}

export default async function LyricsPage() {
  const supabase = createPublicClient();

  // Albums — reverse chronological
  const { data: albumRows } = await supabase
    .from("releases")
    .select("id, title, slug, release_date")
    .eq("status", "published")
    .order("release_date", { ascending: false });

  // Album-song junctions
  const { data: junctions } = await supabase
    .from("release_songs")
    .select("release_id, track_number, song:songs(id, title, slug, lyrics, instrumental, status)")
    .order("track_number");

  type SongLite = {
    id: string;
    title: string;
    slug: string;
    lyrics: string | null;
    instrumental: boolean | null;
    status: string;
  };
  type JunctionRow = {
    release_id: string;
    track_number: number;
    song: SongLite | null;
  };
  const junctionRows = (junctions || []) as unknown as JunctionRow[];

  // IDs of songs that belong to an album
  const albumSongIds = new Set(
    junctionRows.map((j) => j.song?.id).filter(Boolean) as string[],
  );

  // Singles = published songs with lyrics (or instrumental) that aren't in any album
  const { data: allSongs } = await supabase
    .from("songs")
    .select("id, title, slug, lyrics, instrumental, status, created_at")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  type SongRow = {
    id: string;
    title: string;
    slug: string;
    lyrics: string | null;
    instrumental: boolean | null;
    status: string;
    created_at: string;
  };

  const singles = ((allSongs || []) as SongRow[])
    .filter((s) => (s.lyrics || s.instrumental) && !albumSongIds.has(s.id))
    .map((s, i) => ({
      id: s.id,
      release_id: "__singles__",
      title: s.title,
      slug: s.slug,
      track_number: i + 1,
      lyrics: s.lyrics || "",
      instrumental: s.instrumental === true,
    }));

  type AlbumLite = { id: string; title: string; slug: string; release_date: string | null };
  const albums = ((albumRows || []) as AlbumLite[]).map((a) => ({
    id: a.id,
    title: a.title,
    slug: a.slug,
    release_year: a.release_date
      ? new Date(a.release_date).getFullYear().toString()
      : undefined,
  }));

  const albumSongs = junctionRows
    .filter((j) => j.song?.status === "published" && (j.song?.lyrics || j.song?.instrumental))
    .map((j) => ({
      id: j.song!.id,
      release_id: j.release_id,
      title: j.song!.title,
      slug: j.song!.slug,
      track_number: j.track_number,
      lyrics: j.song!.lyrics || "",
      instrumental: j.song!.instrumental === true,
    }));

  return (
    <LyricBook
      albums={albums}
      songs={albumSongs}
      singles={singles}
    />
  );
}
