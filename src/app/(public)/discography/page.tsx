import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase-server";
import { AudioPlayer } from "@/components/AudioPlayer";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Discography — Chad Lewine",
  description: "Stream and browse Chad Lewine's discography.",
  alternates: { canonical: "https://chadlewine.com/discography" },
};

interface Album {
  id: string;
  title: string;
  slug: string;
  release_date: string | null;
  cover_art_path: string | null;
}

interface Track {
  id: string;
  album_id: string;
  title: string;
  slug: string;
  track_number: number;
  duration_seconds: number | null;
  streaming_path: string | null;
  price_cents: number | null;
}

export default async function MusicPage() {
  const supabase = createPublicClient();

  const { data: albums } = await supabase
    .from("albums")
    .select("id, title, slug, release_date, cover_art_path")
    .eq("status", "published")
    .order("display_order");

  const { data: tracks } = await supabase
    .from("tracks")
    .select("id, album_id, title, slug, track_number, duration_seconds, streaming_path, price_cents")
    .eq("status", "published")
    .order("track_number");

  const albumList = (albums || []) as Album[];
  const trackList = (tracks || []) as Track[];

  return (
    <div id="page-music" className="page-static">
      <h1 className="page-static__title">Music</h1>

      <AudioPlayer albums={albumList} tracks={trackList} />
    </div>
  );
}
