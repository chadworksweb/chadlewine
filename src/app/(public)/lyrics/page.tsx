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

  const { data: tracks } = await supabase
    .from("tracks")
    .select("id, album_id, title, slug, track_number, lyrics")
    .eq("status", "published")
    .order("track_number");

  return (
    <div id="page-lyrics" className="page-static lyric-book">
      <h1 className="page-static__title">Lyrics</h1>

      <div className="lyric-book__layout">
        {/* TOC — left column */}
        <nav className="lyric-book__toc">
          {(albums || []).map((album) => {
            const albumTracks = (tracks || []).filter((t) => t.album_id === album.id && t.lyrics);
            if (albumTracks.length === 0) return null;
            return (
              <div key={album.id} className="lyric-book__album-group">
                <h2 className="lyric-book__album-title">{album.title}</h2>
                <ul className="lyric-book__track-list">
                  {albumTracks.map((t) => (
                    <li key={t.id}>
                      <Link
                        href={`/lyrics/${album.slug}/${t.slug}`}
                        className="lyric-book__track-link"
                      >
                        {t.track_number}. {t.title}
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
            Select a track to read its lyrics.
          </p>
        </div>
      </div>
    </div>
  );
}
