import type { Metadata } from "next";
import Link from "next/link";
import { createPublicClient } from "@/lib/supabase-server";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Music — Chad Lewine",
  description: "Music by Chad Lewine — discography, curated selections, and lyrics.",
  alternates: { canonical: "https://chadlewine.com/music" },
};

interface Album {
  id: string;
  title: string;
  slug: string;
  release_date: string | null;
  cover_art_path: string | null;
  description: string | null;
}

export default async function MusicHubPage() {
  const supabase = createPublicClient();

  // Latest: most recent by release_date
  const { data: latestRows } = await supabase
    .from("albums")
    .select("id, title, slug, release_date, cover_art_path, description")
    .eq("status", "published")
    .order("release_date", { ascending: false })
    .limit(1);

  // Select: first by display_order (the featured pick)
  const { data: selectRows } = await supabase
    .from("albums")
    .select("id, title, slug, release_date, cover_art_path, description")
    .eq("status", "published")
    .order("display_order", { ascending: true })
    .limit(1);

  const latest = (latestRows?.[0] ?? null) as Album | null;
  let select = (selectRows?.[0] ?? null) as Album | null;

  // If Select is the same album as Latest, grab the next one
  if (select && latest && select.id === latest.id) {
    const { data: altRows } = await supabase
      .from("albums")
      .select("id, title, slug, release_date, cover_art_path, description")
      .eq("status", "published")
      .order("display_order", { ascending: true })
      .limit(1)
      .range(1, 1);
    select = (altRows?.[0] ?? null) as Album | null;
  }

  return (
    <div id="page-music-hub" className="page-static">
      <h1 className="page-static__title">Music</h1>

      <div className="music-hub">
        {/* Latest */}
        {latest && (
          <section className="music-hub__section">
            <h2 className="music-hub__heading">Latest</h2>
            <AlbumCard album={latest} />
          </section>
        )}

        {/* Select */}
        {select && (
          <section className="music-hub__section">
            <h2 className="music-hub__heading">Select</h2>
            <AlbumCard album={select} />
          </section>
        )}

        {/* Discography */}
        <section className="music-hub__section">
          <h2 className="music-hub__heading">Discography</h2>
          <p className="music-hub__desc">Full catalog — 13 albums, streaming audio player.</p>
          <Link href="/discography" className="music-hub__cta">
            Browse Discography →
          </Link>
        </section>
      </div>
    </div>
  );
}

function AlbumCard({ album }: { album: Album }) {
  const year = album.release_date
    ? new Date(album.release_date).getFullYear()
    : null;

  return (
    <Link href="/discography" className="music-hub__card">
      {album.cover_art_path && (
        <img
          src={album.cover_art_path}
          alt={album.title}
          className="music-hub__cover"
          loading="lazy"
        />
      )}
      <div className="music-hub__card-info">
        <span className="music-hub__card-title">{album.title}</span>
        {year && <span className="music-hub__card-year">{year}</span>}
        {album.description && (
          <p className="music-hub__card-desc">{album.description}</p>
        )}
      </div>
    </Link>
  );
}
