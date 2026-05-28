import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient } from "@/lib/supabase-server";
import { VideoPantheon } from "@/components/VideoPantheon";

export const revalidate = 60;

const DEFAULT_METADATA: Metadata = {
  title: "Music Videos",
  description:
    "Chad Lewine's music videos -- enshrined one at a time on a single stage.",
  alternates: { canonical: "https://chadlewine.com/music-videos" },
  openGraph: {
    title: "Music Videos - Chad Lewine",
    description: "Music videos enshrined one at a time on a single stage.",
    url: "https://chadlewine.com/music-videos",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/music-videos", DEFAULT_METADATA);
}

export default async function VideoPage() {
  const supabase = createPublicClient();

  const { data: categories } = await supabase
    .from("video_categories")
    .select("id, title, slug")
    .order("display_order");

  const { data: videos } = await supabase
    .from("videos")
    .select(
      "id, title, slug, category_id, stream_id, embed_url, thumbnail_path, description, is_featured, duration_seconds, published_at",
    )
    .eq("status", "published")
    .order("is_featured", { ascending: false })
    .order("published_at", { ascending: false });

  const rows = videos || [];

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Music Videos - Chad Lewine",
    url: "https://chadlewine.com/music-videos",
    numberOfItems: rows.length,
    itemListElement: rows.map((v, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `https://chadlewine.com/music-videos?v=${v.slug}`,
      name: v.title,
    })),
  };

  return (
    <div id="page-video" className="page-video">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />

      <header className="pantheon-hero" aria-labelledby="pantheon-hero-heading">
        <div className="pantheon-hero__inner">
          <h1 id="pantheon-hero-heading" className="pantheon-hero__title">Chad Lewine Music Videos</h1>
        </div>
      </header>

      {rows.length === 0 ? (
        <p className="pantheon-empty">The stage is being prepared. Come back soon.</p>
      ) : (
        <VideoPantheon categories={categories || []} videos={rows} />
      )}
    </div>
  );
}
