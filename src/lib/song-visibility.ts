export const VISIBILITY_CATEGORIES = [
  { slug: "story", label: "The Story", description: "Origin & backstory", autoGenerate: false },
  { slug: "breakdown", label: "The Breakdown", description: "Craft & construction", autoGenerate: true },
  { slug: "world", label: "The World", description: "Thematic universe", autoGenerate: false },
  { slug: "audience", label: "The Audience", description: "Who needs this song", autoGenerate: false },
  { slug: "hooks", label: "The Hooks", description: "GEO/SEO discovery angles", autoGenerate: true },
  { slug: "fragments", label: "The Fragments", description: "Quotable lines & shareable content", autoGenerate: true },
  { slug: "connections", label: "The Connections", description: "Catalog cross-linking", autoGenerate: true },
  { slug: "visual", label: "The Visual", description: "Visual & multimedia extensions", autoGenerate: false },
  { slug: "cultural-position", label: "The Cultural Position", description: "Critical & editorial angles", autoGenerate: true },
] as const;

export type VisibilityCategory = typeof VISIBILITY_CATEGORIES[number]["slug"];

export interface SongVisibilitySection {
  id: string;
  song_id: string;
  category: VisibilityCategory;
  content: string;
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
