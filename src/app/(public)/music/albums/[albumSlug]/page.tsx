import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase-server";
import { AlbumDetail } from "@/components/AlbumDetail";

export const revalidate = 60;

async function getAlbumData(albumSlug: string) {
  const supabase = createPublicClient();

  const { data: album } = await supabase
    .from("albums")
    .select("*, release_formats(label)")
    .eq("slug", albumSlug)
    .eq("status", "published")
    .single();
  if (!album) return null;

  // Get songs via junction
  const { data: junctions } = await supabase
    .from("album_songs")
    .select("track_number, song:songs(id, title, slug, duration_seconds, streaming_path, price, status)")
    .eq("album_id", album.id)
    .order("track_number");

  const songs = (junctions || [])
    .filter((j: any) => j.song?.status === "published")
    .map((j: any) => ({
      id: j.song.id,
      title: j.song.title,
      slug: j.song.slug,
      track_number: j.track_number,
      duration_seconds: j.song.duration_seconds,
      streaming_path: j.song.streaming_path,
      price: j.song.price,
    }));

  return { album, songs };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ albumSlug: string }>;
}): Promise<Metadata> {
  const { albumSlug } = await params;
  const result = await getAlbumData(albumSlug);
  if (!result) return {};

  const { album } = result;
  return {
    title: `${album.title} — Chad Lewine`,
    description: album.description || `${album.title} by Chad Lewine.`,
    alternates: {
      canonical: `https://chadlewine.com/music/albums/${albumSlug}`,
    },
  };
}

export default async function AlbumDetailPage({
  params,
}: {
  params: Promise<{ albumSlug: string }>;
}) {
  const { albumSlug } = await params;
  const result = await getAlbumData(albumSlug);
  if (!result) notFound();

  const { album, songs } = result;

  return (
    <AlbumDetail
      album={{
        id: album.id,
        title: album.title,
        slug: album.slug,
        cover_art_path: album.cover_art_path,
        cover_art_alt: album.cover_art_alt,
        release_date: album.release_date,
        description: album.description,
        format_label: (album as any).release_formats?.label || null,
        price: album.price,
      }}
      songs={songs.map((s) => ({
        id: s.id,
        title: s.title,
        slug: s.slug,
        track_number: s.track_number,
        duration_seconds: s.duration_seconds,
        streaming_path: s.streaming_path,
        price: s.price,
      }))}
    />
  );
}
