import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import Link from "next/link";
import { createPublicClient } from "@/lib/supabase-server";

export const revalidate = 60;

const DEFAULT_METADATA: Metadata = {
  title: "Music — Chad Lewine",
  description: "Music by Chad Lewine — discography, curated selections, and lyrics.",
  alternates: { canonical: "https://chadlewine.com/music" },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/music", DEFAULT_METADATA);
}

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

  const { data: latestRows } = await supabase
    .from("albums")
    .select("id, title, slug, release_date, cover_art_path, description")
    .eq("status", "published")
    .order("release_date", { ascending: false })
    .limit(1);

  const { data: selectSetting } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "music_hub_select_album_id")
    .maybeSingle();
  const selectedId = selectSetting?.value || null;

  const latest = (latestRows?.[0] ?? null) as Album | null;
  let select: Album | null = null;

  if (selectedId) {
    const { data: pickedRows } = await supabase
      .from("albums")
      .select("id, title, slug, release_date, cover_art_path, description")
      .eq("status", "published")
      .eq("id", selectedId)
      .limit(1);
    select = (pickedRows?.[0] ?? null) as Album | null;
  }

  if (!select) {
    const { data: selectRows } = await supabase
      .from("albums")
      .select("id, title, slug, release_date, cover_art_path, description")
      .eq("status", "published")
      .order("display_order", { ascending: true })
      .limit(2);
    select = (selectRows?.[0] ?? null) as Album | null;
    if (select && latest && select.id === latest.id) {
      select = (selectRows?.[1] ?? null) as Album | null;
    }
  }

  // Four covers for the Discography CTA mosaic
  const excludeIds = [latest?.id, select?.id].filter(Boolean) as string[];
  let mosaicQuery = supabase
    .from("albums")
    .select("id, cover_art_path")
    .eq("status", "published")
    .not("cover_art_path", "is", null)
    .order("release_date", { ascending: false })
    .limit(4);
  if (excludeIds.length > 0) {
    mosaicQuery = mosaicQuery.not("id", "in", `(${excludeIds.join(",")})`);
  }
  const { data: mosaicRows } = await mosaicQuery;
  const mosaic = (mosaicRows || []).map((r) => r.cover_art_path).filter(Boolean) as string[];

  return (
    <div id="page-music-hub" className="page-static">
      <h1 className="page-static__title">Music</h1>

      <div className="music-hub">
        <section className="music-hub__col">
          <h2 className="music-hub__heading">Latest</h2>
          {latest ? <AlbumCard album={latest} /> : <EmptyCard />}
        </section>

        <section className="music-hub__col">
          <h2 className="music-hub__heading">Select</h2>
          {select ? <AlbumCard album={select} /> : <EmptyCard />}
        </section>

        <section className="music-hub__col">
          <h2 className="music-hub__heading">Discography</h2>
          <Link href="/discography" className="music-hub__card-link">
            <div className="music-hub__mosaic" aria-hidden="true">
              {mosaic.length === 4 ? (
                mosaic.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt=""
                    className="music-hub__mosaic-tile"
                    loading="lazy"
                  />
                ))
              ) : (
                <div className="music-hub__mosaic-empty" />
              )}
            </div>
            <div className="music-hub__card-info">
              <span className="music-hub__card-title">Browse All</span>
              <span className="music-hub__card-year">Full catalog →</span>
            </div>
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
    <Link href={`/music/albums/${album.slug}`} className="music-hub__card-link">
      {album.cover_art_path ? (
        <img
          src={album.cover_art_path}
          alt={album.title}
          className="music-hub__cover"
          loading="lazy"
        />
      ) : (
        <div className="music-hub__cover music-hub__cover--empty" />
      )}
      <div className="music-hub__card-info">
        <span className="music-hub__card-title">{album.title}</span>
        {year && <span className="music-hub__card-year">{year}</span>}
      </div>
    </Link>
  );
}

function EmptyCard() {
  return (
    <div className="music-hub__card-link">
      <div className="music-hub__cover music-hub__cover--empty" />
      <div className="music-hub__card-info">
        <span className="music-hub__card-title">—</span>
      </div>
    </div>
  );
}
