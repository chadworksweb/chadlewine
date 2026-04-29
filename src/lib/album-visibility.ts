// Album Visibility Engine — categories, types, and data-payload shapes.
//
// Two kinds of sections live in album_visibility_sections:
//   - "narrative" — AI-assisted prose with the same direct-answer/prose/key-points
//     stack as song visibility. Admin can regenerate via Claude.
//   - "data"      — admin curates picks of existing site entities (songs, art,
//     videos, products, observations, albums). Stored in data_payload jsonb.
//
// `default_status` controls what newly-seeded sections land as. Data sections
// default to 'published' because their content is just curation; narrative
// sections default to 'draft' so admin can review the AI output first.

export type AlbumVisibilityKind = "narrative" | "data";

export interface AlbumVisibilityCategoryDef {
  slug: string;
  label: string;
  description: string;
  kind: AlbumVisibilityKind;
  default_status?: "draft" | "published";
  /** Narrative-only: should the AI auto-generate without an interview? */
  autoGenerate?: boolean;
}

export const ALBUM_VISIBILITY_CATEGORIES: AlbumVisibilityCategoryDef[] = [
  // Data — album song slider (auto-pulls from album_songs unless picked)
  {
    slug: "song-slider",
    label: "Songs (Cover Slider)",
    description: "Big slider with one cover-hero per song in the album",
    kind: "data",
    default_status: "published",
  },

  // Narrative — album-specific
  {
    slug: "story",
    label: "The Story",
    description: "Origin & backstory — when, where, why this album came to be",
    kind: "narrative",
    autoGenerate: false,
  },
  {
    slug: "world",
    label: "The World",
    description: "Thematic universe — the world this album lives inside",
    kind: "narrative",
    autoGenerate: false,
  },
  {
    slug: "audience",
    label: "The Audience",
    description: "Who this album is for — the listener it's reaching",
    kind: "narrative",
    autoGenerate: false,
  },
  {
    slug: "breakdown",
    label: "The Breakdown",
    description: "Craft & construction — how the album is built",
    kind: "narrative",
    autoGenerate: true,
  },
  {
    slug: "cultural-position",
    label: "The Cultural Position",
    description: "What this album reflects about where culture is right now",
    kind: "narrative",
    autoGenerate: true,
  },
  {
    slug: "if-you-like",
    label: "If You Like",
    description: "Similar famous artists & albums fans would search for",
    kind: "narrative",
    autoGenerate: true,
  },
  {
    slug: "connections",
    label: "The Connections",
    description: "Catalog cross-linking — how this album connects to other Chad work",
    kind: "narrative",
    autoGenerate: true,
  },
  {
    slug: "sync-placements",
    label: "Sync Placements",
    description: "Placement scenarios — film, TV, trailer, ad, game contexts this album fits",
    kind: "narrative",
    autoGenerate: true,
  },
  {
    slug: "fragments",
    label: "The Fragments",
    description: "Quotable lines & shareable content from across the album",
    kind: "narrative",
    autoGenerate: true,
  },
  {
    slug: "hooks",
    label: "The Hooks",
    description: "Door-page discovery angles (internal, admin-only language allowed)",
    kind: "narrative",
    autoGenerate: true,
  },

  // Data — admin curates picks
  {
    slug: "lyrics",
    label: "Lyrics",
    description: "Per-track lyric aggregator — pick which tracks to feature on the album page",
    kind: "data",
    default_status: "published",
  },
  {
    slug: "art",
    label: "Art",
    description: "Image gallery — album cover, track art, and any extra visuals",
    kind: "data",
    default_status: "published",
  },
  {
    slug: "video",
    label: "Video",
    description: "Music videos, lyric videos, BTS — admin curated list",
    kind: "data",
    default_status: "published",
  },
  {
    slug: "merch",
    label: "Merch",
    description: "Album-related products — admin picks which to feature",
    kind: "data",
    default_status: "published",
  },
  {
    slug: "you-might-also-like",
    label: "You Might Also Like",
    description: "Other albums in Chad's catalog to surface here",
    kind: "data",
    default_status: "published",
  },
  {
    slug: "related-observations",
    label: "Related Observations",
    description: "Observations to surface alongside this album",
    kind: "data",
    default_status: "published",
  },
];

export type AlbumVisibilityCategory = (typeof ALBUM_VISIBILITY_CATEGORIES)[number]["slug"];

// ─── data_payload shapes ────────────────────────────────────────────────────
// Everything the admin curates lives under data_payload.{kind}. A single jsonb
// column keeps the table simple; type guards on the consumer side narrow per
// category.

export interface DataPayloadSongSlider {
  song_ids: string[] | null; // null = auto (all songs in album, track order)
}

export interface DataPayloadLyrics {
  song_ids: string[]; // ordered list — admin picks which tracks to feature
}

export interface DataPayloadArt {
  // Each item is either a song's art, the album cover, or a free-form image URL
  items: Array<
    | { kind: "song-art"; song_id: string; aspect: AlbumArtAspect }
    | { kind: "album-cover"; aspect: AlbumArtAspect }
    | { kind: "url"; url: string; alt: string | null; aspect: AlbumArtAspect }
  >;
}

/** Three crop aspects baked into the site styling. */
export type AlbumArtAspect = "landscape" | "square" | "portrait";

export interface DataPayloadVideo {
  items: Array<{
    title: string;
    url: string; // YouTube/Vimeo/MP4
    poster: string | null; // fallback thumbnail (any image URL)
    label: string | null; // "Music Video", "Lyric Video", "BTS", etc.
  }>;
}

export interface DataPayloadMerch {
  product_ids: string[];
}

export interface DataPayloadYouMightAlsoLike {
  album_ids: string[];
}

export interface DataPayloadRelatedObservations {
  observation_ids: string[];
}

export interface AlbumVisibilitySection {
  id: string;
  album_id: string;
  category: AlbumVisibilityCategory;
  content: string;
  direct_answer: string | null;
  key_points: string[];
  data_payload: Record<string, unknown>;
  status: "draft" | "published";
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface AlbumVisibilityMessage {
  id: string;
  album_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

/** Lookup helper. */
export function getAlbumCategoryDef(
  slug: string,
): AlbumVisibilityCategoryDef | null {
  return ALBUM_VISIBILITY_CATEGORIES.find((c) => c.slug === slug) || null;
}
