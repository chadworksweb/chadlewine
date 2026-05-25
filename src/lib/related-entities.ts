import type { SupabaseClient } from "@supabase/supabase-js";

// The site's cross-linkable content types. "merch" = products. Mirrors the
// vocabulary already used by homepage_hero / synapses (entity_type + entity_id).
export const ENTITY_TYPES = ["song", "release", "merch", "art", "observation"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ENTITY_LABEL: Record<EntityType, string> = {
  song: "Song",
  release: "Release",
  merch: "Merch",
  art: "Art",
  observation: "Observation",
};

export interface EntityRef {
  entity_type: EntityType;
  entity_id: string;
}

export interface ResolvedEntity {
  entity_type: EntityType;
  id: string;
  slug: string;
  title: string;
  image: string | null;
  alt: string | null;
  href: string;
}

interface Row { id: string; slug: string | null; title: string }

// Resolve a mixed, ordered list of entity refs into display-ready cards.
// Preserves the given order; drops refs whose target is missing/unpublished.
export async function resolveEntities(
  supabase: SupabaseClient,
  refs: EntityRef[],
  opts: { includeUnpublished?: boolean } = {},
): Promise<ResolvedEntity[]> {
  if (refs.length === 0) return [];
  const all = opts.includeUnpublished === true;

  const idsByType: Record<EntityType, string[]> = { song: [], release: [], merch: [], art: [], observation: [] };
  for (const r of refs) {
    if (idsByType[r.entity_type]) idsByType[r.entity_type].push(r.entity_id);
  }

  const [songs, releases, products, art, observations] = await Promise.all([
    idsByType.song.length
      ? (() => { const q = supabase.from("songs").select("id, slug, title, art_image_path, art_alt").in("id", idsByType.song); return all ? q : q.in("status", ["published", "unreleased"]); })()
      : Promise.resolve({ data: [] }),
    idsByType.release.length
      ? (() => { const q = supabase.from("releases").select("id, slug, title, cover_art_path, cover_art_alt").in("id", idsByType.release); return all ? q : q.in("status", ["published", "unreleased"]); })()
      : Promise.resolve({ data: [] }),
    idsByType.merch.length
      ? (() => { const q = supabase.from("products").select("id, slug, title, image_url, image_alt").in("id", idsByType.merch); return all ? q : q.eq("status", "active"); })()
      : Promise.resolve({ data: [] }),
    idsByType.art.length
      ? (() => { const q = supabase.from("art_pieces").select("id, slug, title, image_path, image_alt").in("id", idsByType.art); return all ? q : q.in("status", ["published", "unreleased"]); })()
      : Promise.resolve({ data: [] }),
    idsByType.observation.length
      ? (() => { const q = supabase.from("observations").select("id, slug, title, art_image_path, art_alt").in("id", idsByType.observation); return all ? q : q.eq("status", "published"); })()
      : Promise.resolve({ data: [] }),
  ]);

  type SongRow = Row & { art_image_path: string | null; art_alt: string | null };
  type ReleaseRow = Row & { cover_art_path: string | null; cover_art_alt: string | null };
  type ProductRow = Row & { image_url: string | null; image_alt: string | null };
  type ArtRow = Row & { image_path: string | null; image_alt: string | null };
  type ObsRow = Row & { art_image_path: string | null; art_alt: string | null };

  // Album-cover fallback for songs lacking their own art (matches homepage feed).
  const songRows = (songs.data || []) as SongRow[];
  const songNeedsFallback = songRows.filter((s) => !s.art_image_path).map((s) => s.id);
  const coverBySong = new Map<string, { path: string | null; alt: string | null }>();
  if (songNeedsFallback.length > 0) {
    const { data: junctions } = await supabase
      .from("release_songs")
      .select("song_id, release:releases(cover_art_path, cover_art_alt)")
      .in("song_id", songNeedsFallback);
    for (const j of (junctions || []) as Array<{ song_id: string; release: { cover_art_path: string | null; cover_art_alt: string | null } | { cover_art_path: string | null; cover_art_alt: string | null }[] | null }>) {
      const rel = Array.isArray(j.release) ? j.release[0] : j.release;
      if (rel && !coverBySong.has(j.song_id)) coverBySong.set(j.song_id, { path: rel.cover_art_path, alt: rel.cover_art_alt });
    }
  }

  const maps = {
    song: new Map(songRows.map((r) => [r.id, r])),
    release: new Map(((releases.data || []) as ReleaseRow[]).map((r) => [r.id, r])),
    merch: new Map(((products.data || []) as ProductRow[]).map((r) => [r.id, r])),
    art: new Map(((art.data || []) as ArtRow[]).map((r) => [r.id, r])),
    observation: new Map(((observations.data || []) as ObsRow[]).map((r) => [r.id, r])),
  };

  const out: ResolvedEntity[] = [];
  for (const ref of refs) {
    const id = ref.entity_id;
    switch (ref.entity_type) {
      case "song": {
        const s = maps.song.get(id); if (!s || !s.slug) break;
        const fb = coverBySong.get(id);
        out.push({ entity_type: "song", id, slug: s.slug, title: s.title, image: s.art_image_path || fb?.path || null, alt: s.art_alt || fb?.alt || s.title, href: `/music/songs/${s.slug}` });
        break;
      }
      case "release": {
        const r = maps.release.get(id); if (!r || !r.slug) break;
        out.push({ entity_type: "release", id, slug: r.slug, title: r.title, image: r.cover_art_path, alt: r.cover_art_alt || r.title, href: `/music/releases/${r.slug}` });
        break;
      }
      case "merch": {
        const p = maps.merch.get(id); if (!p || !p.slug) break;
        out.push({ entity_type: "merch", id, slug: p.slug, title: p.title, image: p.image_url, alt: p.image_alt || p.title, href: `/merch/${p.slug}` });
        break;
      }
      case "art": {
        const a = maps.art.get(id); if (!a || !a.slug) break;
        out.push({ entity_type: "art", id, slug: a.slug, title: a.title, image: a.image_path, alt: a.image_alt || a.title, href: `/art/${a.slug}` });
        break;
      }
      case "observation": {
        const o = maps.observation.get(id); if (!o || !o.slug) break;
        out.push({ entity_type: "observation", id, slug: o.slug, title: o.title, image: o.art_image_path, alt: o.art_alt || o.title, href: `/observations/${o.slug}` });
        break;
      }
    }
  }
  return out;
}
