import type { Metadata } from "next";
import Link from "next/link";
import { createPublicClient } from "@/lib/supabase-server";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Discography — Chad Lewine",
  description: "Browse Chad Lewine's full discography.",
  alternates: { canonical: "https://chadlewine.com/discography" },
};

interface Album {
  id: string;
  title: string;
  slug: string;
  release_date: string | null;
  cover_art_path: string | null;
  release_formats: { label: string } | null;
}

export default async function DiscographyPage() {
  const supabase = createPublicClient();

  const { data: albums } = await supabase
    .from("albums")
    .select("id, title, slug, release_date, cover_art_path, release_formats(label)")
    .eq("status", "published")
    .order("release_date", { ascending: false });

  const albumList = (albums || []) as unknown as Album[];

  return (
    <div id="page-discography" className="page-static">
      <h1 className="page-static__title">Discography</h1>

      <div className="discography-grid">
        {albumList.map((album) => {
          const year = album.release_date
            ? new Date(album.release_date).getFullYear()
            : null;

          return (
            <div key={album.id} className="discography-grid__card">
              <Link href={`/music/albums/${album.slug}`} className="discography-grid__art-link">
                {album.cover_art_path && (
                  <img
                    src={album.cover_art_path}
                    alt={album.title}
                    className="discography-grid__cover"
                    loading="lazy"
                  />
                )}
              </Link>
              <div className="discography-grid__info">
                <Link href={`/music/albums/${album.slug}`} className="discography-grid__title">
                  {album.title}
                </Link>
                <span className="discography-grid__meta">
                  {album.release_formats?.label && (
                    <span className="discography-grid__format">{album.release_formats.label}</span>
                  )}
                  {year && <span className="discography-grid__year">{year}</span>}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
