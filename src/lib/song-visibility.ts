// Two kinds of sections, matching the release model:
//   - "narrative" — AI-assisted prose (direct-answer / prose / key-points).
//   - "data"      — admin curates picks of existing entities (e.g. products),
//                   stored in data_payload jsonb; never AI-generated.
export const VISIBILITY_CATEGORIES = [
  { slug: "audience", label: "The Audience", description: "Who needs this song", kind: "narrative", autoGenerate: false },
  { slug: "world", label: "The World", description: "Thematic universe", kind: "narrative", autoGenerate: false },
  { slug: "fragments", label: "The Fragments", description: "Quotable lines & shareable content", kind: "narrative", autoGenerate: true },
  { slug: "cultural-position", label: "The Cultural Position", description: "What this song reflects about where culture is right now", kind: "narrative", autoGenerate: true },
  { slug: "story", label: "The Story", description: "Origin & backstory", kind: "narrative", autoGenerate: false },
  { slug: "breakdown", label: "The Breakdown", description: "Craft & construction", kind: "narrative", autoGenerate: true },
  { slug: "connections", label: "The Connections", description: "Catalog cross-linking", kind: "narrative", autoGenerate: true },
  { slug: "sync-placements", label: "Sync Placements", description: "Placement scenarios — film, TV, trailer, ad, game contexts this song fits", kind: "narrative", autoGenerate: true },
  { slug: "hooks", label: "The Hooks", description: "Door page discovery angles (internal)", kind: "narrative", autoGenerate: true },
  { slug: "merch", label: "Merch", description: "Song-related products -- admin picks which to feature", kind: "data", autoGenerate: false },
] as const;

export type VisibilityCategory = typeof VISIBILITY_CATEGORIES[number]["slug"];
export type VisibilityKind = "narrative" | "data";

export interface SongVisibilitySection {
  id: string;
  song_id: string;
  category: VisibilityCategory;
  content: string;
  direct_answer: string | null;
  key_points: string[];
  data_payload: Record<string, unknown> | null;
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
