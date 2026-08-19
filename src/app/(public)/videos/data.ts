// Data + URL helpers shared by /videos and /videos/[slug].
//
// Every video is a real page now. The old shape was /videos?v=slug, which could
// not be prerendered or given its own metadata without opting the whole library
// into request-time rendering; next.config 301s that form here.

import { createPublicClient } from "@/lib/supabase-server";
import type { PantheonVideo } from "@/components/PantheonStage";

export const VIDEOS_URL = "https://chadlewine.com/videos";

export function videoPath(slug: string): string {
  return `/videos/${slug}`;
}

export function videoUrl(slug: string): string {
  return `${VIDEOS_URL}/${slug}`;
}

export interface VideoCategory {
  id: string;
  title: string;
  slug: string;
}

// The row shape the Pantheon renders, plus the song join the JSON-LD needs to
// tie a video to its catalog recording.
export type LibraryVideo = PantheonVideo & {
  seo_title: string | null;
  seo_description: string | null;
  song_id: string | null;
  song: { slug: string; status: string } | { slug: string; status: string }[] | null;
};

const VIDEO_COLUMNS =
  "id, title, slug, category_id, stream_id, embed_url, thumbnail_path, description, seo_title, seo_description, is_featured, duration_seconds, published_at, song_id, song:songs(slug, status)";

export async function fetchLibrary(): Promise<{
  categories: VideoCategory[];
  videos: LibraryVideo[];
}> {
  const supabase = createPublicClient();

  const [{ data: categories }, { data: videos }] = await Promise.all([
    supabase.from("video_categories").select("id, title, slug").order("display_order"),
    supabase
      .from("videos")
      .select(VIDEO_COLUMNS)
      .eq("status", "published")
      .order("is_featured", { ascending: false })
      .order("published_at", { ascending: false }),
  ]);

  return {
    categories: (categories || []) as VideoCategory[],
    videos: (videos || []) as unknown as LibraryVideo[],
  };
}

// Single published video by slug. Returns null for drafts and unknown slugs so
// callers can 404 rather than leak an unpublished title through metadata.
export async function fetchVideo(slug: string): Promise<LibraryVideo | null> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("videos")
    .select(VIDEO_COLUMNS)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  return (data as unknown as LibraryVideo) ?? null;
}

// Slugs for generateStaticParams -- every published video prerenders.
export async function fetchVideoSlugs(): Promise<string[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("videos")
    .select("slug")
    .eq("status", "published");
  return ((data || []) as { slug: string }[]).map((v) => v.slug);
}
