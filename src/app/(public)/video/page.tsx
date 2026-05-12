import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient } from "@/lib/supabase-server";
import { VideoGrid } from "@/components/VideoGrid";

export const revalidate = 60;

const DEFAULT_METADATA: Metadata = {
  title: "Video",
  description: "Watch Chad Lewine's videos.",
  alternates: { canonical: "https://chadlewine.com/video" },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/video", DEFAULT_METADATA);
}

export default async function VideoPage() {
  const supabase = createPublicClient();

  const { data: categories } = await supabase
    .from("video_categories")
    .select("id, title, slug")
    .order("display_order");

  const { data: videos } = await supabase
    .from("videos")
    .select("id, title, slug, category_id, stream_id, embed_url, thumbnail_path, description, is_featured, duration_seconds")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  return (
    <div id="page-video" className="page-static">
      <h1 className="page-static__title">Video</h1>
      <VideoGrid categories={categories || []} videos={videos || []} />
    </div>
  );
}
