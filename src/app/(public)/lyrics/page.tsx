import Link from "next/link";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase-server";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Lyrics — Chad Lewine",
  description: "Read lyrics from Chad Lewine's discography.",
  alternates: { canonical: "https://chadlewine.com/lyrics" },
};

export default async function LyricsPage() {
  const supabase = createPublicClient();

  const { data: albums } = await supabase
    .from("albums")
    .select("id, title, slug, cover_art_path")
    .eq("status", "published")
    .order("display_order");

  // Get songs with track numbers via junction
  const { data: junctions } = await supabase
    .from("album_songs")
    .select("album_id, track_number, song:songs(id, title, slug, lyrics, status)")
    .order("track_number");

  // Flatten and filter published songs with lyrics
  const songs = (junctions || [])
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
    <div id="page-lyrics" className="page-static lyric-book">
      <h1 className="page-static__title">Lyrics</h1>

      <div className="lyric-book__layout">
        {/* TOC — left column */}
        <nav className="lyric-book__toc">
          {(albums || []).map((album) => {
            const albumSongs = songs.filter((s: any) => s.album_id === album.id);
            if (albumSongs.length === 0) return null;
            return (
              <div key={album.id} className="lyric-book__album-group">
                <h2 className="lyric-book__album-title">{album.title}</h2>
                <ul className="lyric-book__track-list">
                  {albumSongs.map((s: any) => (
                    <li key={s.id}>
                      <Link
                        href={`/lyrics/${album.slug}/${s.slug}`}
                        className="lyric-book__track-link"
                      >
                        {s.track_number}. {s.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        {/* Reading pane — right column (placeholder for index) */}
        <div className="lyric-book__pane">
          <p style={{ color: "var(--text-tertiary)" }}>
            Select a song to read its lyrics.
          </p>
        </div>
      </div>
    </div>
  );
}
