import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient } from "@/lib/supabase-server";
import { DiscographyExplorer } from "@/components/DiscographyExplorer";
import { releaseTypeLabel, releaseFormatLabel } from "@/lib/release-labels";
import { getSingleSongIds } from "@/lib/song-singles";
import { fetchReleaseSkusForIds } from "@/lib/release-skus";

export const revalidate = 60;

const DEFAULT_METADATA: Metadata = {
  title: "Discography",
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

export type DiscographyReleaseType = "album" | "ep" | "single" | "compilation";

export interface DiscographyItem {
  id: string;
  title: string;
  slug: string;
  type: "album" | "single";
  release_type: DiscographyReleaseType;
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

  // Albums, EPs, compilations. Singles are handled via the song-side path
  // below so each single renders once (linking to /music/songs/SLUG, the
  // canonical song page per the songs-are-atomic model). Today's
  // singles-as-releases migration created release rows for each single,
  // but those should not appear as a separate discography card.
  const { data: albums } = await supabase
    .from("releases")
    .select("id, title, slug, release_date, cover_art_path, concept_statement, release_type")
    .eq("status", "published")
    .neq("release_type", "single")
    .order("release_date", { ascending: false });

  const albumIds = (albums || []).map((a: any) => a.id);
  const allReleaseIds: string[] = [...albumIds];

  // SKUs per release — feeds format chips + the listing card price hint.
  const skusByRelease = await fetchReleaseSkusForIds(supabase, albumIds);

  // Map of release_id -> comma-separated format label list. If a release has
  // multiple SKU formats sellable, we surface "Digital, Vinyl" etc. Falls
  // back to the release type label when a release has no SKUs.
  const formatLabelByRelease = new Map<string, string | null>();
  for (const id of albumIds) {
    const skus = skusByRelease.get(id) || [];
    if (skus.length === 0) {
      formatLabelByRelease.set(id, null);
      continue;
    }
    const labels = Array.from(
      new Set(skus.map((s) => releaseFormatLabel(s.format)).filter(Boolean)),
    );
    formatLabelByRelease.set(id, labels.length > 1 ? "Multiple formats" : labels[0] || null);
  }

  // Tracklists for all albums in one query
  let tracksByAlbum: Record<string, string[]> = {};
  if (albumIds.length > 0) {
    const { data: tracks } = await supabase
      .from("release_songs")
      .select("release_id, track_number, song:songs(title, status)")
      .in("release_id", albumIds)
      .order("track_number");
    for (const t of tracks || []) {
      const song = Array.isArray((t as any).song) ? (t as any).song[0] : (t as any).song;
      if (!song || (song.status !== "published" && song.status !== "unreleased")) continue;
      const aid = (t as any).release_id;
      (tracksByAlbum[aid] ||= []).push(song.title);
    }
  }

  const albumItems: DiscographyItem[] = (albums || []).map((a: any) => {
    const skuLabel = formatLabelByRelease.get(a.id) ?? null;
    const typeLabel = releaseTypeLabel(a.release_type);
    return {
      id: a.id,
      title: a.title,
      slug: a.slug,
      type: "album" as const,
      release_type: (a.release_type ?? "album") as DiscographyReleaseType,
      release_date: a.release_date,
      cover_art_path: a.cover_art_path,
      format_label: [skuLabel, typeLabel].filter(Boolean).join(" ") || null,
      href: `/music/releases/${a.slug}`,
      chorus: null,
      tracklist: tracksByAlbum[a.id] || null,
      concept_statement: a.concept_statement || null,
      card_focal_x: null,
      card_focal_y: null,
      card_zoom: null,
      faces: [],
    };
  });

  // Singles — songs linked to a release of type 'single'
  const singleIdsSet = await getSingleSongIds(supabase);
  const singleIdsList = [...singleIdsSet];
  const { data: singles } = singleIdsList.length === 0
    ? { data: [] as Array<{ id: string; title: string; slug: string; release_date: string | null; art_image_path: string | null; chorus: string | null; card_focal_x: number | null; card_focal_y: number | null; card_zoom: number | null }> }
    : await supabase
        .from("songs")
        .select("id, title, slug, release_date, art_image_path, chorus, card_focal_x, card_focal_y, card_zoom")
        .eq("status", "published")
        .in("id", singleIdsList)
        .order("release_date", { ascending: false });

  const singleIds = (singles || []).map((s: any) => s.id);

  // Get album art fallback for singles. Only consider album-type releases —
  // skip the new single-type release that this song now owns.
  let albumArtBySong: Record<string, string | null> = {};
  if (singleIds.length > 0) {
    const { data: junctions } = await supabase
      .from("release_songs")
      .select("song_id, release:releases(cover_art_path, release_type)")
      .in("song_id", singleIds);
    for (const j of junctions || []) {
      const alb = Array.isArray((j as any).release) ? (j as any).release[0] : (j as any).release;
      if (alb?.release_type === "single") continue;
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
    release_type: "single" as DiscographyReleaseType,
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

  const allItems = [...albumItems, ...singleItems];

  // Filter chips run on release_type, ordered album -> ep -> single ->
  // compilation. Only types with at least one item are surfaced.
  const TYPE_ORDER: DiscographyReleaseType[] = ["album", "ep", "single", "compilation"];
  const typeSet = new Set<DiscographyReleaseType>();
  for (const item of allItems) typeSet.add(item.release_type);
  const allTypes = TYPE_ORDER.filter((t) => typeSet.has(t));

  // Sort chronologically by default (newest first)
  allItems.sort((a, b) => {
    const da = a.release_date ? new Date(a.release_date).getTime() : 0;
    const db = b.release_date ? new Date(b.release_date).getTime() : 0;
    return db - da;
  });

  return {
    items: allItems,
    allTypes,
  };
}

export default async function DiscographyPage() {
  const { items, allTypes } = await getDiscography();

  return (
    <div id="page-discography">
      <h1 className="page-static__title">Discography</h1>
      <DiscographyExplorer items={items} allTypes={allTypes} />
    </div>
  );
}
