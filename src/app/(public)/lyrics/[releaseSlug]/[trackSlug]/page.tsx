import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase-server";
import { YouMightAlsoLike } from "@/components/YouMightAlsoLike";

export const revalidate = 60;

async function getSongWithAlbum(releaseSlug: string, songSlug: string) {
  const supabase = createPublicClient();

  const { data: album } = await supabase
    .from("releases")
    .select("id, title, slug")
    .eq("slug", releaseSlug)
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
    .from("release_songs")
    .select("track_number")
    .eq("release_id", album.id)
    .eq("song_id", song.id)
    .single();
  if (!junction) return null;

  return { album, song: { ...song, track_number: junction.track_number } };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ releaseSlug: string; trackSlug: string }>;
}): Promise<Metadata> {
  const { releaseSlug, trackSlug } = await params;
  const result = await getSongWithAlbum(releaseSlug, trackSlug);
  if (!result) return {};
  return {
    title: `${result.song.title} Lyrics — ${result.album.title} — Chad Lewine`,
    alternates: { canonical: `https://chadlewine.com/lyrics/${releaseSlug}/${trackSlug}` },
  };
}

export default async function SongLyricsPage({
  params,
}: {
  params: Promise<{ releaseSlug: string; trackSlug: string }>;
}) {
  const { releaseSlug, trackSlug } = await params;
  const result = await getSongWithAlbum(releaseSlug, trackSlug);
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

      {song.instrumental ? (
        <p style={{ color: "var(--text-tertiary)", fontStyle: "italic" }}>
          Instrumental track — no lyrics.
        </p>
      ) : song.lyrics ? (
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

      <YouMightAlsoLike sourceType="song" sourceId={song.id} />
    </div>
  );
}
