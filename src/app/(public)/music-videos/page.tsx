import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient } from "@/lib/supabase-server";
import { VideoPantheon } from "@/components/VideoPantheon";
import { ARTIST_ID, absoluteImage, isoDuration } from "@/lib/artist-schema";

const VIDEOS_URL = "https://chadlewine.com/music-videos";

function uploadIso(published_at: string | null): string | undefined {
  if (!published_at) return undefined;
  const d = new Date(published_at);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

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

  // One VideoObject per video -- thumbnail, upload date, and duration make these
  // eligible for Google video results; author ties each to the artist entity.
  const videoNodes = rows.map((v) => {
    const thumb = absoluteImage(v.thumbnail_path);
    const uploaded = uploadIso(v.published_at);
    const dur = isoDuration(v.duration_seconds);
    return {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      "@id": `${VIDEOS_URL}?v=${v.slug}#video`,
      name: v.title,
      description: v.description || `${v.title} -- a music video by Chad Lewine.`,
      url: `${VIDEOS_URL}?v=${v.slug}`,
      ...(thumb ? { thumbnailUrl: thumb } : {}),
      ...(uploaded ? { uploadDate: uploaded } : {}),
      ...(dur ? { duration: dur } : {}),
      ...(v.embed_url ? { embedUrl: v.embed_url } : {}),
      author: { "@id": ARTIST_ID },
      creator: { "@id": ARTIST_ID },
    };
  });

  // Collection wrapper, each entry pointing at its VideoObject node by @id.
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Music Videos - Chad Lewine",
    url: VIDEOS_URL,
    numberOfItems: rows.length,
    itemListElement: rows.map((v, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${VIDEOS_URL}?v=${v.slug}`,
      name: v.title,
    })),
  };

  return (
    <div id="page-video" className="page-video">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      {videoNodes.map((node) => (
        <script
          key={node["@id"]}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }}
        />
      ))}

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
