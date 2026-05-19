/**
 * Public album visibility renderer.
 *
 * Reads album_visibility_sections (published) in display_order, then dispatches
 * each row to the right server-side render based on category.kind:
 *  - narrative → renders direct_answer / prose / key_points (Concept, Story, ...)
 *  - data      → renders the category's specific layout (lyrics, art, video,
 *                merch, you-might-also-like, related-observations, song-slider)
 *
 * No tagline / lede copy — only the section heading and content.
 */

import Link from "next/link";
import Image from "next/image";
import { createPublicClient } from "@/lib/supabase-server";
import {
  RELEASE_VISIBILITY_CATEGORIES,
  getReleaseCategoryDef,
  type ReleaseVisibilitySection,
  type ReleaseArtAspect,
} from "@/lib/release-visibility";
import { MerchProductCard } from "@/components/MerchProductCard";
import { AlbumSongSliderSection } from "@/components/AlbumSongSliderSection";
import type { HeroLensItem } from "@/components/HeroLens";

interface SongRow {
  id: string;
  title: string;
  slug: string;
  lyrics: string | null;
  chorus: string | null;
  release_date: string | null;
  art_image_path: string | null;
  art_alt: string | null;
  song_summary: string | null;
  hero_focal_x: number | null;
  hero_focal_y: number | null;
  hero_zoom: number | null;
  card_focal_x: number | null;
  card_focal_y: number | null;
  card_zoom: number | null;
}

interface AlbumLite {
  id: string;
  title: string;
  slug: string;
  cover_art_path: string | null;
  cover_art_alt: string | null;
  release_date: string | null;
  concept_statement: string | null;
  citation_summary?: string | null;
  entity_tags?: string[] | null;
}

interface ProductLite {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  image_alt: string | null;
}

interface ObservationLite {
  id: string;
  title: string;
  slug: string;
  art_image_path: string | null;
  art_alt: string | null;
  date_captured: string | null;
}

export async function ReleaseSections({
  albumId,
  album,
}: {
  albumId: string;
  album: AlbumLite;
}) {
  const supabase = createPublicClient();

  const { data: rawSections } = await supabase
    .from("release_visibility_sections")
    .select("*")
    .eq("release_id", albumId)
    .eq("status", "published")
    .order("display_order")
    .order("created_at");

  const sections = (rawSections || []) as ReleaseVisibilitySection[];
  const hasGeoFields = !!album.citation_summary || (Array.isArray(album.entity_tags) && album.entity_tags.length > 0);
  // The About / Concept / per-category sections each render independently.
  // Bail only when none of them would produce output.
  if (sections.length === 0 && !album.concept_statement && !hasGeoFields) return null;

  // Tracklist songs (used by song-slider, lyrics, art).
  const { data: junctions } = await supabase
    .from("release_songs")
    .select("track_number, song:songs(id, title, slug, lyrics, chorus, release_date, art_image_path, art_alt, song_summary, hero_focal_x, hero_focal_y, hero_zoom, card_focal_x, card_focal_y, card_zoom, status)")
    .eq("release_id", albumId)
    .order("track_number");

  type JunctionRow = {
    track_number: number;
    song: (SongRow & { status: string }) | (SongRow & { status: string })[] | null;
  };
  const albumSongs: Array<SongRow & { track_number: number }> = ((junctions || []) as unknown as JunctionRow[])
    .map((j) => {
      const s = Array.isArray(j.song) ? j.song[0] : j.song;
      if (!s) return null;
      if (s.status !== "published" && s.status !== "unreleased") return null;
      return { ...s, track_number: j.track_number };
    })
    .filter(Boolean) as Array<SongRow & { track_number: number }>;

  // Resolve all referenced ids across data sections in one pass.
  const songIdsToFetch = new Set<string>();
  const productIdsToFetch = new Set<string>();
  const albumIdsToFetch = new Set<string>();
  const observationIdsToFetch = new Set<string>();

  for (const s of sections) {
    const def = getReleaseCategoryDef(s.category);
    if (!def || def.kind !== "data") continue;
    type PayloadShape = {
      song_ids?: string[];
      product_ids?: string[];
      release_ids?: string[];
      observation_ids?: string[];
      items?: { kind?: string; song_id?: string }[];
    };
    const p = (s.data_payload || {}) as PayloadShape;
    if (s.category === "lyrics" && Array.isArray(p.song_ids)) {
      for (const id of p.song_ids) songIdsToFetch.add(id);
    }
    if (s.category === "art" && Array.isArray(p.items)) {
      for (const item of p.items) {
        if (item.kind === "song-art" && item.song_id) songIdsToFetch.add(item.song_id);
      }
    }
    if (s.category === "merch" && Array.isArray(p.product_ids)) {
      for (const id of p.product_ids) productIdsToFetch.add(id);
    }
    if (s.category === "you-might-also-like" && Array.isArray(p.release_ids)) {
      for (const id of p.release_ids) albumIdsToFetch.add(id);
    }
    if (s.category === "related-observations" && Array.isArray(p.observation_ids)) {
      for (const id of p.observation_ids) observationIdsToFetch.add(id);
    }
  }

  // Album-songs cover most song lookups already; only fetch songs not in the album.
  const haveSongIds = new Set(albumSongs.map((s) => s.id));
  const extraSongIds = Array.from(songIdsToFetch).filter((id) => !haveSongIds.has(id));

  const [
    { data: extraSongs },
    { data: products },
    { data: relatedAlbums },
    { data: observations },
  ] = await Promise.all([
    extraSongIds.length > 0
      ? supabase
          .from("songs")
          .select("id, title, slug, lyrics, chorus, release_date, art_image_path, art_alt, song_summary, hero_focal_x, hero_focal_y, hero_zoom, card_focal_x, card_focal_y, card_zoom")
          .in("id", extraSongIds)
      : Promise.resolve({ data: [] as SongRow[] }),
    productIdsToFetch.size > 0
      ? supabase
          .from("products")
          .select("id, slug, title, image_url, image_alt")
          .in("id", Array.from(productIdsToFetch))
          .eq("status", "active")
      : Promise.resolve({ data: [] as ProductLite[] }),
    albumIdsToFetch.size > 0
      ? supabase
          .from("releases")
          .select("id, title, slug, cover_art_path, cover_art_alt, release_date, concept_statement")
          .in("id", Array.from(albumIdsToFetch))
          .in("status", ["unreleased", "published"])
      : Promise.resolve({ data: [] as AlbumLite[] }),
    observationIdsToFetch.size > 0
      ? supabase
          .from("observations")
          .select("id, title, slug, art_image_path, art_alt, date_captured")
          .in("id", Array.from(observationIdsToFetch))
          .eq("status", "published")
      : Promise.resolve({ data: [] as ObservationLite[] }),
  ]);

  // Build lookup maps.
  const songsById = new Map<string, SongRow & { track_number?: number }>();
  for (const s of albumSongs) songsById.set(s.id, s);
  for (const s of (extraSongs || []) as SongRow[]) {
    if (!songsById.has(s.id)) songsById.set(s.id, s);
  }
  const productsById = new Map((products || []).map((p) => [p.id, p as ProductLite]));
  const albumsById = new Map((relatedAlbums || []).map((a) => [a.id, a as AlbumLite]));
  const observationsById = new Map((observations || []).map((o) => [o.id, o as ObservationLite]));

  return (
    <>
      {hasGeoFields && (
        <section className="album-section album-section--about" aria-labelledby="album-section-about">
          <div className="album-section__inner">
            <h2 className="album-section__heading" id="album-section-about">
              What is the album &ldquo;{album.title}&rdquo; by Chad Lewine about?
            </h2>
            {album.citation_summary && (
              <p className="album-section__direct-answer">{album.citation_summary}</p>
            )}
            {Array.isArray(album.entity_tags) && album.entity_tags.length > 0 && (
              <>
                <h3 className="album-section__subheading">Topics &amp; themes</h3>
                <ul className="album-section__key-points">
                  {album.entity_tags.filter((t) => t && t.trim()).map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </section>
      )}
      {album.concept_statement && (
        <section className="album-section album-section--concept" aria-labelledby="album-section-concept">
          <div className="album-section__inner">
            <h2 className="album-section__heading" id="album-section-concept">Concept</h2>
            <div className="album-section__prose">
              {album.concept_statement.split(/\n\n+/).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </div>
        </section>
      )}
      {sections.map((s) => {
        const def = getReleaseCategoryDef(s.category);
        if (!def) return null;

        if (def.kind === "narrative") {
          if (!s.content && !s.direct_answer && (!s.key_points || s.key_points.length === 0)) return null;
          return <NarrativeSection key={s.id} section={s} label={def.label} />;
        }

        // Data sections
        switch (s.category) {
          case "song-slider":
            return (
              <SongSlider
                key={s.id}
                albumSongs={albumSongs}
                album={album}
                payload={s.data_payload}
              />
            );
          case "lyrics":
            return <LyricsSection key={s.id} payload={s.data_payload} songsById={songsById} />;
          case "art":
            return (
              <ArtSection
                key={s.id}
                payload={s.data_payload}
                album={album}
                songsById={songsById}
              />
            );
          case "video":
            return <VideoSection key={s.id} payload={s.data_payload} />;
          case "merch":
            return <MerchSection key={s.id} payload={s.data_payload} productsById={productsById} />;
          case "you-might-also-like":
            return <YouMightAlsoLikeSection key={s.id} payload={s.data_payload} albumsById={albumsById} />;
          case "related-observations":
            return <RelatedObservationsSection key={s.id} payload={s.data_payload} observationsById={observationsById} />;
          default:
            return null;
        }
      })}
    </>
  );
}

// ─── Narrative ──────────────────────────────────────────────────────────────

function NarrativeSection({ section, label }: { section: ReleaseVisibilitySection; label: string }) {
  return (
    <section className="album-section album-section--narrative" aria-labelledby={`album-section-${section.category}`}>
      <div className="album-section__inner">
        <h2 className="album-section__heading" id={`album-section-${section.category}`}>{label}</h2>
        {section.direct_answer && (
          <p className="album-section__direct-answer">{section.direct_answer}</p>
        )}
        {section.content && (
          <div className="album-section__prose">
            {section.content.split("\n\n").map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        )}
        {section.key_points && section.key_points.length > 0 && (
          <ul className="album-section__key-points">
            {section.key_points.map((kp, i) => <li key={i}>{kp}</li>)}
          </ul>
        )}
      </div>
    </section>
  );
}

// ─── Song Slider ────────────────────────────────────────────────────────────

function SongSlider({
  albumSongs,
  album,
  payload,
}: {
  albumSongs: Array<SongRow & { track_number: number }>;
  album: AlbumLite;
  payload: Record<string, unknown>;
}) {
  const pickedIds = (payload as { song_ids?: string[] | null }).song_ids;
  const ordered: Array<SongRow & { track_number: number }> = (() => {
    if (Array.isArray(pickedIds) && pickedIds.length > 0) {
      const map = new Map(albumSongs.map((s) => [s.id, s]));
      return pickedIds.map((id) => map.get(id)).filter(Boolean) as Array<SongRow & { track_number: number }>;
    }
    return albumSongs;
  })();

  // Fallback to the album cover when a song has no per-track art (most tracks).
  const items: HeroLensItem[] = ordered
    .map((s): HeroLensItem | null => {
      const art = s.art_image_path || album.cover_art_path;
      if (!art) return null;
      return {
        slug: s.slug,
        title: s.title,
        date: s.release_date,
        artImagePath: art,
        artAlt: s.art_alt || album.cover_art_alt || s.title,
        href: `/music/songs/${s.slug}`,
        ctaLabel: "Listen",
        focalX: s.hero_focal_x != null ? s.hero_focal_x / 100 : 0.5,
        focalY: s.hero_focal_y != null ? s.hero_focal_y / 100 : 0.5,
        zoom: s.hero_zoom != null && s.hero_zoom >= 1 ? s.hero_zoom : 1,
      };
    })
    .filter(Boolean) as HeroLensItem[];

  return <AlbumSongSliderSection items={items} />;
}

// ─── Lyrics ─────────────────────────────────────────────────────────────────

function LyricsSection({ payload, songsById }: { payload: Record<string, unknown>; songsById: Map<string, SongRow & { track_number?: number }> }) {
  const ids = ((payload as { song_ids?: string[] }).song_ids) || [];
  const tracks = ids.map((id) => songsById.get(id)).filter(Boolean) as Array<SongRow & { track_number?: number }>;
  if (tracks.length === 0) return null;
  return (
    <section className="album-section album-section--lyrics" aria-labelledby="album-section-lyrics">
      <div className="album-section__inner">
        <h2 className="album-section__heading" id="album-section-lyrics">Lyrics</h2>
        <ul className="album-section__lyrics-list">
          {tracks.map((t) => (
            <li key={t.id} className="album-section__lyrics-card">
              <Link href={`/lyrics/${t.slug}`} className="album-section__lyrics-link">
                {t.art_image_path && (
                  <span className="album-section__lyrics-thumb">
                    <Image src={t.art_image_path} alt={t.art_alt || t.title} fill sizes="(max-width: 720px) 100vw, 200px" />
                  </span>
                )}
                <span className="album-section__lyrics-meta">
                  {t.track_number != null && (
                    <span className="album-section__lyrics-num">{String(t.track_number).padStart(2, "0")}</span>
                  )}
                  <span className="album-section__lyrics-title">{t.title}</span>
                  <span className="album-section__lyrics-cta">Read Lyrics →</span>
                </span>
                {t.chorus && (
                  <span className="album-section__lyrics-chorus">{t.chorus}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ─── Art ────────────────────────────────────────────────────────────────────

interface ArtItem {
  kind: "song-art" | "album-cover" | "url";
  song_id?: string;
  url?: string;
  alt?: string | null;
  aspect: ReleaseArtAspect;
}

function ArtSection({
  payload,
  album,
  songsById,
}: {
  payload: Record<string, unknown>;
  album: AlbumLite;
  songsById: Map<string, SongRow & { track_number?: number }>;
}) {
  const items = ((payload as { items?: ArtItem[] }).items) || [];
  if (items.length === 0) return null;
  return (
    <section className="album-section album-section--art" aria-labelledby="album-section-art">
      <div className="album-section__inner">
        <h2 className="album-section__heading" id="album-section-art">Art</h2>
        <div className="album-section__art-grid">
          {items.map((it, i) => {
            let src: string | null = null;
            let alt: string = "";
            if (it.kind === "album-cover") { src = album.cover_art_path; alt = album.cover_art_alt || album.title; }
            else if (it.kind === "song-art" && it.song_id) {
              const s = songsById.get(it.song_id);
              if (s) { src = s.art_image_path; alt = s.art_alt || s.title; }
            } else if (it.kind === "url" && it.url) { src = it.url; alt = it.alt || ""; }
            if (!src) return null;
            return (
              <figure key={i} className={`album-section__art-cell album-section__art-cell--${it.aspect}`}>
                <Image
                  src={src}
                  alt={alt}
                  fill
                  sizes="(max-width: 720px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
              </figure>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Video ──────────────────────────────────────────────────────────────────

interface VideoItem {
  title: string;
  url: string;
  poster: string | null;
  label: string | null;
}

function VideoSection({ payload }: { payload: Record<string, unknown> }) {
  const items = ((payload as { items?: VideoItem[] }).items) || [];
  if (items.length === 0) return null;
  return (
    <section className="album-section album-section--video" aria-labelledby="album-section-video">
      <div className="album-section__inner">
        <h2 className="album-section__heading" id="album-section-video">Video</h2>
        <div className="album-section__video-grid">
          {items.map((v, i) => {
            const youtubeId = extractYouTubeId(v.url);
            const vimeoId = extractVimeoId(v.url);
            return (
              <figure key={i} className="album-section__video-cell">
                <div className="album-section__video-frame">
                  {youtubeId ? (
                    <iframe
                      src={`https://www.youtube.com/embed/${youtubeId}`}
                      title={v.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      loading="lazy"
                    />
                  ) : vimeoId ? (
                    <iframe
                      src={`https://player.vimeo.com/video/${vimeoId}`}
                      title={v.title}
                      allow="autoplay; fullscreen; picture-in-picture"
                      allowFullScreen
                      loading="lazy"
                    />
                  ) : (
                    <video src={v.url} poster={v.poster || undefined} controls preload="metadata" />
                  )}
                </div>
                <figcaption className="album-section__video-cap">
                  <span className="album-section__video-title">{v.title}</span>
                  {v.label && <span className="album-section__video-label">{v.label}</span>}
                </figcaption>
              </figure>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}
function extractVimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  return m ? m[1] : null;
}

// ─── Merch ──────────────────────────────────────────────────────────────────

function MerchSection({ payload, productsById }: { payload: Record<string, unknown>; productsById: Map<string, ProductLite> }) {
  const ids = ((payload as { product_ids?: string[] }).product_ids) || [];
  const products = ids.map((id) => productsById.get(id)).filter(Boolean) as ProductLite[];
  if (products.length === 0) return null;
  return (
    <section className="album-section album-section--merch" aria-labelledby="album-section-merch">
      <div className="album-section__inner">
        <h2 className="album-section__heading" id="album-section-merch">Merch</h2>
        <div className="merch-shop__grid">
          {products.map((p) => (
            <MerchProductCard
              key={p.id}
              id={p.id}
              slug={p.slug}
              title={p.title}
              image_url={p.image_url}
              image_alt={p.image_alt}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── You Might Also Like ────────────────────────────────────────────────────

function YouMightAlsoLikeSection({ payload, albumsById }: { payload: Record<string, unknown>; albumsById: Map<string, AlbumLite> }) {
  const ids = ((payload as { release_ids?: string[] }).release_ids) || [];
  const items = ids.map((id) => albumsById.get(id)).filter(Boolean) as AlbumLite[];
  if (items.length === 0) return null;
  return (
    <section className="album-section album-section--ymal" aria-labelledby="album-section-ymal">
      <div className="album-section__inner">
        <h2 className="album-section__heading" id="album-section-ymal">You Might Also Like</h2>
        <div className="album-section__ymal-grid">
          {items.map((a) => (
            <Link key={a.id} href={`/music/releases/${a.slug}`} className="album-section__ymal-card">
              {a.cover_art_path && (
                <span className="album-section__ymal-thumb">
                  <Image src={a.cover_art_path} alt={a.cover_art_alt || a.title} fill sizes="(max-width: 720px) 50vw, 240px" />
                </span>
              )}
              <span className="album-section__ymal-title">{a.title}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Related Observations ───────────────────────────────────────────────────

function RelatedObservationsSection({ payload, observationsById }: { payload: Record<string, unknown>; observationsById: Map<string, ObservationLite> }) {
  const ids = ((payload as { observation_ids?: string[] }).observation_ids) || [];
  const items = ids.map((id) => observationsById.get(id)).filter(Boolean) as ObservationLite[];
  if (items.length === 0) return null;
  return (
    <section className="album-section album-section--obs" aria-labelledby="album-section-obs">
      <div className="album-section__inner">
        <h2 className="album-section__heading" id="album-section-obs">Related Observations</h2>
        <div className="album-section__obs-grid">
          {items.map((o) => (
            <Link key={o.id} href={`/observations/${o.slug}`} className="album-section__obs-card">
              {o.art_image_path && (
                <span className="album-section__obs-thumb">
                  <Image src={o.art_image_path} alt={o.art_alt || o.title} fill sizes="(max-width: 720px) 50vw, 240px" />
                </span>
              )}
              <span className="album-section__obs-title">{o.title}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

// Suppress unused: RELEASE_VISIBILITY_CATEGORIES kept for future explicit ordering.
void RELEASE_VISIBILITY_CATEGORIES;
