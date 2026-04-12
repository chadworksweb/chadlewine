import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase-server";
import { DiscographyExplorer } from "@/components/DiscographyExplorer";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Discography — Chad Lewine",
  description: "Browse Chad Lewine's full discography — albums, EPs, and singles.",
  alternates: { canonical: "https://chadlewine.com/discography" },
};

export interface DiscographyItem {
  id: string;
  title: string;
  slug: string;
  type: "album" | "single";
  release_date: string | null;
  cover_art_path: string | null;
  format_label: string | null;
  href: string;
}

async function getDiscography() {
  const supabase = createPublicClient();

  // Albums
  const { data: albums } = await supabase
    .from("albums")
    .select("id, title, slug, release_date, cover_art_path, release_formats(label)")
    .eq("status", "published")
    .order("release_date", { ascending: false });

  const albumItems: DiscographyItem[] = (albums || []).map((a: any) => ({
    id: a.id,
    title: a.title,
    slug: a.slug,
    type: "album" as const,
    release_date: a.release_date,
    cover_art_path: a.cover_art_path,
    format_label: a.release_formats?.label || null,
    href: `/music/albums/${a.slug}`,
  }));

  // Singles
  const { data: singles } = await supabase
    .from("songs")
    .select("id, title, slug, release_date, art_image_path")
    .eq("status", "published")
    .eq("is_single", true)
    .order("release_date", { ascending: false });

  const singleIds = (singles || []).map((s: any) => s.id);

  // Get album art fallback for singles
  let albumArtBySong: Record<string, string | null> = {};
  if (singleIds.length > 0) {
    const { data: junctions } = await supabase
      .from("album_songs")
      .select("song_id, album:albums(cover_art_path)")
      .in("song_id", singleIds);
    for (const j of junctions || []) {
      const alb = Array.isArray((j as any).album) ? (j as any).album[0] : (j as any).album;
      if (alb?.cover_art_path && !albumArtBySong[(j as any).song_id]) {
        albumArtBySong[(j as any).song_id] = alb.cover_art_path;
      }
    }
  }

  const singleItems: DiscographyItem[] = (singles || []).map((s: any) => ({
    id: s.id,
    title: s.title,
    slug: s.slug,
    type: "single" as const,
    release_date: s.release_date,
    cover_art_path: s.art_image_path || albumArtBySong[s.id] || null,
    format_label: "Digital Single",
    href: `/music/songs/${s.slug}`,
  }));

  // Collect unique format labels
  const allItems = [...albumItems, ...singleItems];
  const formatSet = new Set<string>();
  for (const item of allItems) {
    if (item.format_label) formatSet.add(item.format_label);
  }

  // Sort chronologically by default (newest first)
  allItems.sort((a, b) => {
    const da = a.release_date ? new Date(a.release_date).getTime() : 0;
    const db = b.release_date ? new Date(b.release_date).getTime() : 0;
    return db - da;
  });

  return {
    items: allItems,
    allFormats: [...formatSet].sort(),
  };
}

export default async function DiscographyPage() {
  const { items, allFormats } = await getDiscography();

  return (
    <div id="page-discography" className="page-static">
      <h1 className="page-static__title">Discography</h1>
      <DiscographyExplorer items={items} allFormats={allFormats} />
    </div>
  );
}
