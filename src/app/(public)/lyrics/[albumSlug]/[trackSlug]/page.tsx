import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase-server";

export const revalidate = 60;

async function getTrackWithAlbum(albumSlug: string, trackSlug: string) {
  const supabase = createPublicClient();

  const { data: album } = await supabase
    .from("albums")
    .select("id, title, slug")
    .eq("slug", albumSlug)
    .single();
  if (!album) return null;

  const { data: track } = await supabase
    .from("tracks")
    .select("*")
    .eq("album_id", album.id)
    .eq("slug", trackSlug)
    .single();
  if (!track) return null;

  return { album, track };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ albumSlug: string; trackSlug: string }>;
}): Promise<Metadata> {
  const { albumSlug, trackSlug } = await params;
  const result = await getTrackWithAlbum(albumSlug, trackSlug);
  if (!result) return {};
  return {
    title: `${result.track.title} Lyrics — ${result.album.title} — Chad Lewine`,
    alternates: { canonical: `https://chadlewine.com/lyrics/${albumSlug}/${trackSlug}` },
  };
}

export default async function TrackLyricsPage({
  params,
}: {
  params: Promise<{ albumSlug: string; trackSlug: string }>;
}) {
  const { albumSlug, trackSlug } = await params;
  const result = await getTrackWithAlbum(albumSlug, trackSlug);
  if (!result) notFound();

  const { album, track } = result;

  return (
    <div id="page-lyrics" className="page-static lyric-book">
      <nav style={{ marginBottom: "var(--space-lg)" }}>
        <Link href="/lyrics" style={{ color: "var(--text-accent)", fontSize: "var(--text-sm)" }}>
          All Lyrics
        </Link>
        <span style={{ color: "var(--text-tertiary)", margin: "0 8px" }}>/</span>
        <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>{album.title}</span>
      </nav>

      <h1 className="page-static__title">{track.title}</h1>
      <p style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-xs)", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "var(--space-xl)" }}>
        {album.title} &middot; Track {track.track_number}
      </p>

      {track.lyrics ? (
        <div className="lyric-book__lyrics" style={{ whiteSpace: "pre-wrap", lineHeight: 1.8 }}>
          {track.lyrics}
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
