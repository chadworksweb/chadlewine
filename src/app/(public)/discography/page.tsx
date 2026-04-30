import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient } from "@/lib/supabase-server";
import { DiscographyExplorer } from "@/components/DiscographyExplorer";

export const revalidate = 60;

const DEFAULT_METADATA: Metadata = {
  title: "Discography — Chad Lewine",
  description: "Browse Chad Lewine's full discography — albums, EPs, and singles.",
  alternates: { canonical: "https://chadlewine.com/discography" },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/discography", DEFAULT_METADATA);
}

export interface CubeFace {
  slot: number;
  media_type: "image" | "video";
  media_path: string;
  focal_x: number | null;
  focal_y: number | null;
  zoom: number | null;
}

export interface DiscographyItem {
  id: string;
  title: string;
  slug: string;
  type: "album" | "single";
  release_date: string | null;
  cover_art_path: string | null;
  format_label: string | null;
  href: string;
  chorus: string | null;
  tracklist: string[] | null;
  concept_statement: string | null;
  card_focal_x: number | null;
  card_focal_y: number | null;
  card_zoom: number | null;
  faces: CubeFace[];
}

async function getDiscography() {
  const supabase = createPublicClient();

  // Albums
  const { data: albums } = await supabase
    .from("albums")
    .select("id, title, slug, release_date, cover_art_path, concept_statement, release_formats(label)")
    .eq("status", "published")
    .order("release_date", { ascending: false });

  const albumIds = (albums || []).map((a: any) => a.id);
  const allReleaseIds: string[] = [...albumIds];

  // Tracklists for all albums in one query
  let tracksByAlbum: Record<string, string[]> = {};
  if (albumIds.length > 0) {
    const { data: tracks } = await supabase
      .from("album_songs")
      .select("album_id, track_number, song:songs(title, status)")
      .in("album_id", albumIds)
      .order("track_number");
    for (const t of tracks || []) {
      const song = Array.isArray((t as any).song) ? (t as any).song[0] : (t as any).song;
      if (!song || (song.status !== "published" && song.status !== "unreleased")) continue;
      const aid = (t as any).album_id;
      (tracksByAlbum[aid] ||= []).push(song.title);
    }
  }

  const albumItems: DiscographyItem[] = (albums || []).map((a: any) => ({
    id: a.id,
    title: a.title,
    slug: a.slug,
    type: "album" as const,
    release_date: a.release_date,
    cover_art_path: a.cover_art_path,
    format_label: a.release_formats?.label || null,
    href: `/music/albums/${a.slug}`,
    chorus: null,
    tracklist: tracksByAlbum[a.id] || null,
    concept_statement: a.concept_statement || null,
    card_focal_x: null,
    card_focal_y: null,
    card_zoom: null,
    faces: [],
  }));

  // Singles
  const { data: singles } = await supabase
    .from("songs")
    .select("id, title, slug, release_date, art_image_path, chorus, card_focal_x, card_focal_y, card_zoom")
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
    format_label: "Single",
    href: `/music/songs/${s.slug}`,
    chorus: s.chorus || null,
    tracklist: null,
    concept_statement: null,
    card_focal_x: s.card_focal_x ?? null,
    card_focal_y: s.card_focal_y ?? null,
    card_zoom: s.card_zoom ?? null,
    faces: [],
  }));

  for (const s of singleIds) allReleaseIds.push(s);

  // Cube face media for the simpler discography cube. One query covers both
  // albums and singles; we partition by release_type when zipping back into
  // the per-item arrays.
  if (allReleaseIds.length > 0) {
    const { data: faces } = await supabase
      .from("release_cube_faces")
      .select("release_type, release_id, slot, media_type, media_path, focal_x, focal_y, zoom")
      .in("release_id", allReleaseIds)
      .order("slot");
    const byKey = new Map<string, CubeFace[]>();
    for (const f of (faces || []) as Array<CubeFace & { release_type: string; release_id: string }>) {
      const key = `${f.release_type}:${f.release_id}`;
      (byKey.get(key) ?? byKey.set(key, []).get(key)!).push({
        slot: f.slot,
        media_type: f.media_type,
        media_path: f.media_path,
        focal_x: f.focal_x,
        focal_y: f.focal_y,
        zoom: f.zoom,
      });
    }
    for (const item of albumItems) {
      item.faces = byKey.get(`album:${item.id}`) ?? [];
    }
    for (const item of singleItems) {
      item.faces = byKey.get(`song:${item.id}`) ?? [];
    }
  }

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
    <div id="page-discography">
      <h1 className="page-static__title">Discography</h1>
      <DiscographyExplorer items={items} allFormats={allFormats} />
    </div>
  );
}
