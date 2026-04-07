import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase-server";
import { SongDetail } from "@/components/SongDetail";
import { SongChargeJsonLd } from "@/components/SongChargeJsonLd";
import { fetchBadge } from "@/lib/rising-compass";

export const revalidate = 60;

async function getSongData(songSlug: string) {
  const supabase = createPublicClient();

  const { data: song } = await supabase
    .from("songs")
    .select("*")
    .eq("slug", songSlug)
    .eq("status", "published")
    .single();
  if (!song) return null;

  // Get album via junction
  const { data: junction } = await supabase
    .from("album_songs")
    .select("track_number, album:albums(id, title, slug, cover_art_path, cover_art_alt, price, status)")
    .eq("song_id", song.id)
    .single();

  const album = (junction as any)?.album;
  if (!album || album.status !== "published") return null;

  // Total tracks on this album
  const { count } = await supabase
    .from("album_songs")
    .select("id", { count: "exact", head: true })
    .eq("album_id", album.id);

  // Published expansions for this song
  const { data: expansions } = await supabase
    .from("expansions")
    .select("id, title, slug, body")
    .eq("song_id", song.id)
    .eq("status", "published")
    .order("display_order")
    .order("created_at");

  return {
    album,
    song: { ...song, track_number: junction!.track_number },
    totalTracks: count || 0,
    expansions: expansions || [],
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await getSongData(slug);
  if (!result) return {};

  const { song, album } = result;
  return {
    title: `${song.title} — ${album.title} — Chad Lewine`,
    description: song.song_summary || `${song.title} from ${album.title} by Chad Lewine.`,
    alternates: {
      canonical: `https://chadlewine.com/music/songs/${slug}`,
    },
  };
}

export default async function SongDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getSongData(slug);
  if (!result) notFound();

  const { album, song, totalTracks, expansions } = result;

  const badge = await fetchBadge(song.title, "Chad Lewine");

  return (
    <>
      <SongDetail
        song={{
          id: song.id,
          title: song.title,
          slug: song.slug,
          track_number: song.track_number,
          duration_seconds: song.duration_seconds,
          streaming_path: song.streaming_path,
          lyrics: song.lyrics,
          price: song.price,
          release_date: song.release_date,
          song_summary: song.song_summary,
          isrc: song.isrc,
        }}
        album={{
          id: album.id,
          title: album.title,
          slug: album.slug,
          cover_art_path: album.cover_art_path,
          cover_art_alt: album.cover_art_alt,
          price: album.price,
        }}
        totalTracks={totalTracks}
        expansions={expansions}
        badge={badge ? {
          tier: badge.tier,
          tierLabel: badge.tier_label,
          tierHex: badge.tier_hex,
          charge: badge.charge,
          chargeSummary: badge.charge_summary,
          contaminated: badge.contaminated,
          contaminationNote: badge.contamination_note,
        } : null}
      />
      {badge && (
        <SongChargeJsonLd
          songTitle={song.title}
          songUrl={`https://chadlewine.com/music/songs/${song.slug}`}
          albumTitle={album.title}
          albumUrl={`https://chadlewine.com/music/albums/${album.slug}`}
          badge={badge}
        />
      )}
    </>
  );
}
