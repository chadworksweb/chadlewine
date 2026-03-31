import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase-server";

export const revalidate = 60;

async function getSongWithAlbum(albumSlug: string, songSlug: string) {
  const supabase = createPublicClient();

  const { data: album } = await supabase
    .from("albums")
    .select("id, title, slug")
    .eq("slug", albumSlug)
    .single();
  if (!album) return null;

  const { data: song } = await supabase
    .from("songs")
    .select("*")
    .eq("slug", songSlug)
    .single();
  if (!song) return null;

  // Get track_number from junction
  const { data: junction } = await supabase
    .from("album_songs")
    .select("track_number")
    .eq("album_id", album.id)
    .eq("song_id", song.id)
    .single();
  if (!junction) return null;

  return { album, song: { ...song, track_number: junction.track_number } };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ albumSlug: string; trackSlug: string }>;
}): Promise<Metadata> {
  const { albumSlug, trackSlug } = await params;
  const result = await getSongWithAlbum(albumSlug, trackSlug);
  if (!result) return {};
  return {
    title: `${result.song.title} Lyrics — ${result.album.title} — Chad Lewine`,
    alternates: { canonical: `https://chadlewine.com/lyrics/${albumSlug}/${trackSlug}` },
  };
}

export default async function SongLyricsPage({
  params,
}: {
  params: Promise<{ albumSlug: string; trackSlug: string }>;
}) {
  const { albumSlug, trackSlug } = await params;
  const result = await getSongWithAlbum(albumSlug, trackSlug);
  if (!result) notFound();

  const { album, song } = result;

  return (
    <div id="page-lyrics" className="page-static lyric-book">
      <nav style={{ marginBottom: "var(--space-lg)" }}>
        <Link href="/lyrics" style={{ color: "var(--text-accent)", fontSize: "var(--text-sm)" }}>
          All Lyrics
        </Link>
        <span style={{ color: "var(--text-tertiary)", margin: "0 8px" }}>/</span>
        <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>{album.title}</span>
      </nav>

      <h1 className="page-static__title">{song.title}</h1>
      <p style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-xs)", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "var(--space-xl)" }}>
        {album.title} &middot; Track {song.track_number}
      </p>

      {song.lyrics ? (
        <div className="lyric-book__lyrics" style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>
          {song.lyrics.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n").replace(/\\r/g, "\n")}
        </div>
      ) : (
        <p style={{ color: "var(--text-tertiary)" }}>Lyrics not yet available.</p>
      )}

      <div style={{ marginTop: "var(--space-xl)" }}>
        <Link href={`/music`} style={{ color: "var(--text-accent)", fontSize: "var(--text-sm)" }}>
          Listen on Music Player
        </Link>
      </div>
    </div>
  );
}
