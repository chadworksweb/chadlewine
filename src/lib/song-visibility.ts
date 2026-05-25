export const VISIBILITY_CATEGORIES = [
  { slug: "audience", label: "The Audience", description: "Who needs this song", autoGenerate: false },
  { slug: "world", label: "The World", description: "Thematic universe", autoGenerate: false },
  { slug: "fragments", label: "The Fragments", description: "Quotable lines & shareable content", autoGenerate: true },
  { slug: "cultural-position", label: "The Cultural Position", description: "What this song reflects about where culture is right now", autoGenerate: true },
  { slug: "story", label: "The Story", description: "Origin & backstory", autoGenerate: false },
  { slug: "breakdown", label: "The Breakdown", description: "Craft & construction", autoGenerate: true },
  { slug: "connections", label: "The Connections", description: "Catalog cross-linking", autoGenerate: true },
  { slug: "sync-placements", label: "Sync Placements", description: "Placement scenarios — film, TV, trailer, ad, game contexts this song fits", autoGenerate: true },
  { slug: "hooks", label: "The Hooks", description: "Door page discovery angles (internal)", autoGenerate: true },
] as const;

export type VisibilityCategory = typeof VISIBILITY_CATEGORIES[number]["slug"];

export interface SongVisibilitySection {
  id: string;
  song_id: string;
  category: VisibilityCategory;
  content: string;
  direct_answer: string | null;
  key_points: string[];
  status: "draft" | "published";
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface SongVisibilityMessage {
  id: string;
  song_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface SongComposition {
  id: string;
  song_id: string;
  content: string;
  content_html: string;
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
}

export interface SongCompositionMessage {
  id: string;
  song_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}
