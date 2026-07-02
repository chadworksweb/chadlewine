import { createPublicClient } from "@/lib/supabase-server";
import type { HeroLensItem, HeroKind } from "@/components/HeroLens";

interface HeroRow {
  id: string;
  entity_type: HeroKind;
  entity_id: string;
  display_order: number;
}

interface SongRow {
  id: string;
  slug: string;
  title: string;
  art_image_path: string | null;
  art_alt: string | null;
  hero_focal_x: number | null;
  hero_focal_y: number | null;
  hero_zoom: number | null;
  release_date: string | null;
}

interface AlbumRow {
  id: string;
  slug: string;
  title: string;
  cover_art_path: string | null;
  cover_art_alt: string | null;
  hero_focal_x: number | null;
  hero_focal_y: number | null;
  hero_zoom: number | null;
}

interface ProductRow {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  image_alt: string | null;
  hero_focal_x: number | null;
  hero_focal_y: number | null;
  hero_zoom: number | null;
}

interface ObservationRow {
  id: string;
  slug: string;
  title: string;
  art_image_path: string | null;
  art_alt: string | null;
  kind: string | null;
  hero_focal_x: number | null;
  hero_focal_y: number | null;
  hero_zoom: number | null;
}

interface ArtRow {
  id: string;
  slug: string;
  title: string;
  image_path: string | null;
  image_alt: string | null;
  hero_focal_x: number | null;
  hero_focal_y: number | null;
  hero_zoom: number | null;
}

interface VideoRow {
  id: string;
  slug: string;
  title: string;
  thumbnail_path: string | null;
  hero_focal_x: number | null;
  hero_focal_y: number | null;
  hero_zoom: number | null;
}

// Focal columns are stored 0-100 (object-position percent); the hero consumes
// 0-1. Missing focal falls back to centered; zoom below 1 is clamped to 1.
function heroFocal(x: number | null, y: number | null, z: number | null) {
  return {
    focalX: x != null ? x / 100 : 0.5,
    focalY: y != null ? y / 100 : 0.5,
    zoom: z != null && z >= 1 ? z : 1,
  };
}

interface AlbumFallback {
  cover_art_path: string | null;
  cover_art_alt: string | null;
  hero_focal_x: number | null;
  hero_focal_y: number | null;
  hero_zoom: number | null;
}

export async function getCuratedHeroItems(): Promise<HeroLensItem[]> {
  const supabase = createPublicClient();
  const { data: rows } = await supabase
    .from("homepage_hero")
    .select("id, entity_type, entity_id, display_order")
    .order("display_order", { ascending: true });

  const heroRows = (rows || []) as HeroRow[];
  if (heroRows.length === 0) return [];

  const idsByType: Record<HeroKind, string[]> = { song: [], release: [], merch: [], observation: [], art: [], video: [] };
  for (const r of heroRows) idsByType[r.entity_type].push(r.entity_id);

  const [songsRes, albumsRes, productsRes, observationsRes, artRes, videosRes] = await Promise.all([
    idsByType.song.length
      ? supabase.from("songs").select("id, slug, title, art_image_path, art_alt, hero_focal_x, hero_focal_y, hero_zoom, release_date").in("id", idsByType.song)
      : Promise.resolve({ data: [] }),
    idsByType.release.length
      ? supabase.from("releases").select("id, slug, title, cover_art_path, cover_art_alt, hero_focal_x, hero_focal_y, hero_zoom").in("id", idsByType.release)
      : Promise.resolve({ data: [] }),
    idsByType.merch.length
      ? supabase.from("merch").select("id, slug, title, image_url, image_alt, hero_focal_x, hero_focal_y, hero_zoom").in("id", idsByType.merch)
      : Promise.resolve({ data: [] }),
    idsByType.observation.length
      ? supabase.from("posts").select("id, slug, title, art_image_path, art_alt, kind, hero_focal_x, hero_focal_y, hero_zoom").in("id", idsByType.observation)
      : Promise.resolve({ data: [] }),
    idsByType.art.length
      ? supabase.from("art_pieces").select("id, slug, title, image_path, image_alt, hero_focal_x, hero_focal_y, hero_zoom").in("id", idsByType.art)
      : Promise.resolve({ data: [] }),
    idsByType.video.length
      ? supabase.from("videos").select("id, slug, title, thumbnail_path, hero_focal_x, hero_focal_y, hero_zoom").eq("status", "published").in("id", idsByType.video)
      : Promise.resolve({ data: [] }),
  ]);

  const songMap = new Map<string, SongRow>(((songsRes.data || []) as SongRow[]).map((r) => [r.id, r]));
  const albumMap = new Map<string, AlbumRow>(((albumsRes.data || []) as AlbumRow[]).map((r) => [r.id, r]));
  const productMap = new Map<string, ProductRow>(((productsRes.data || []) as ProductRow[]).map((r) => [r.id, r]));
  const obsMap = new Map<string, ObservationRow>(((observationsRes.data || []) as ObservationRow[]).map((r) => [r.id, r]));
  const artMap = new Map<string, ArtRow>(((artRes.data || []) as ArtRow[]).map((r) => [r.id, r]));
  const videoMap = new Map<string, VideoRow>(((videosRes.data || []) as VideoRow[]).map((r) => [r.id, r]));

  // Album-cover fallback for songs without per-track art — same logic the
  // homepage already uses so curated songs render identically to the auto feed.
  const songsNeedingFallback = ((songsRes.data || []) as SongRow[])
    .filter((s) => !s.art_image_path)
    .map((s) => s.id);
  const albumBySong: Record<string, AlbumFallback> = {};
  if (songsNeedingFallback.length > 0) {
    const { data: junctions } = await supabase
      .from("release_songs")
      .select("song_id, release:releases(cover_art_path, cover_art_alt, hero_focal_x, hero_focal_y, hero_zoom)")
      .in("song_id", songsNeedingFallback);
    for (const j of (junctions || []) as Array<{ song_id: string; release: AlbumFallback | AlbumFallback[] | null }>) {
      const alb = Array.isArray(j.release) ? j.release[0] : j.release;
      if (alb && !albumBySong[j.song_id]) albumBySong[j.song_id] = alb;
    }
  }

  const items: HeroLensItem[] = [];
  for (const r of heroRows) {
    if (r.entity_type === "song") {
      const s = songMap.get(r.entity_id);
      if (!s) continue;
      const fb = albumBySong[s.id];
      const useAlbum = !s.art_image_path && fb;
      const fx = useAlbum ? fb.hero_focal_x : s.hero_focal_x;
      const fy = useAlbum ? fb.hero_focal_y : s.hero_focal_y;
      const fz = useAlbum ? fb.hero_zoom : s.hero_zoom;
      items.push({
        slug: s.slug,
        title: s.title,
        date: s.release_date,
        artImagePath: s.art_image_path || fb?.cover_art_path || "",
        artAlt: s.art_alt || fb?.cover_art_alt || s.title,
        href: `/music/songs/${s.slug}`,
        ctaLabel: "Listen →",
        focalX: fx != null ? fx / 100 : 0.5,
        focalY: fy != null ? fy / 100 : 0.5,
        zoom: fz != null && fz >= 1 ? fz : 1,
        kind: "song",
      });
    } else if (r.entity_type === "release") {
      const a = albumMap.get(r.entity_id);
      if (!a) continue;
      items.push({
        slug: a.slug,
        title: a.title,
        date: null,
        artImagePath: a.cover_art_path || "",
        artAlt: a.cover_art_alt || a.title,
        href: `/music/releases/${a.slug}`,
        ctaLabel: "Open Album →",
        focalX: a.hero_focal_x != null ? a.hero_focal_x / 100 : 0.5,
        focalY: a.hero_focal_y != null ? a.hero_focal_y / 100 : 0.5,
        zoom: a.hero_zoom != null && a.hero_zoom >= 1 ? a.hero_zoom : 1,
        kind: "release",
      });
    } else if (r.entity_type === "merch") {
      const p = productMap.get(r.entity_id);
      if (!p || !p.slug) continue;
      items.push({
        slug: p.slug,
        title: p.title,
        date: null,
        artImagePath: p.image_url || "",
        artAlt: p.image_alt || p.title,
        href: `/merch/${p.slug}`,
        ctaLabel: "Shop →",
        ...heroFocal(p.hero_focal_x, p.hero_focal_y, p.hero_zoom),
        kind: "merch",
      });
    } else if (r.entity_type === "observation") {
      const o = obsMap.get(r.entity_id);
      if (!o) continue;
      items.push({
        slug: o.slug,
        title: o.title,
        date: null,
        artImagePath: o.art_image_path || "",
        artAlt: o.art_alt || o.title,
        href: `/${o.kind === "journal" ? "journal" : "observations"}/${o.slug}`,
        ctaLabel: "Read →",
        ...heroFocal(o.hero_focal_x, o.hero_focal_y, o.hero_zoom),
        kind: "observation",
      });
    } else if (r.entity_type === "art") {
      const a = artMap.get(r.entity_id);
      if (!a) continue;
      items.push({
        slug: a.slug,
        title: a.title,
        date: null,
        artImagePath: a.image_path || "",
        artAlt: a.image_alt || a.title,
        href: `/art/${a.slug}`,
        ctaLabel: "View →",
        ...heroFocal(a.hero_focal_x, a.hero_focal_y, a.hero_zoom),
        kind: "art",
      });
    } else if (r.entity_type === "video") {
      const v = videoMap.get(r.entity_id);
      if (!v) continue;
      items.push({
        slug: v.slug,
        title: v.title,
        date: null,
        artImagePath: v.thumbnail_path || "",
        artAlt: v.title,
        href: `/music-videos?v=${v.slug}`,
        ctaLabel: "Watch →",
        ...heroFocal(v.hero_focal_x, v.hero_focal_y, v.hero_zoom),
        kind: "video",
      });
    }
  }

  return items;
}
