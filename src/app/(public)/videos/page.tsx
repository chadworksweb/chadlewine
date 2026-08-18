import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient } from "@/lib/supabase-server";
import { VideoPantheon } from "@/components/VideoPantheon";
import { ARTIST_ID, absoluteImage, isoDuration, recordingId } from "@/lib/artist-schema";
import { streamIframeUrl } from "@/lib/bunny-stream";

const VIDEOS_URL = "https://chadlewine.com/videos";

function uploadIso(published_at: string | null): string | undefined {
  if (!published_at) return undefined;
  const d = new Date(published_at);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

export const revalidate = 60;

const DEFAULT_METADATA: Metadata = {
  title: "Videos",
  description:
    "Chad Lewine's video library. Music videos, live performances and more.",
  alternates: { canonical: "https://chadlewine.com/videos" },
  openGraph: {
    title: "Videos - Chad Lewine",
    description: "Chad Lewine's video library. Music videos, live performances and more.",
    url: "https://chadlewine.com/videos",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/videos", DEFAULT_METADATA);
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
      "id, title, slug, category_id, stream_id, embed_url, thumbnail_path, description, seo_title, seo_description, is_featured, duration_seconds, published_at, song_id, song:songs(slug, status)",
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
    // Player URL, mirroring PantheonStage's playback fallback: a third-party
    // embed if we have one, else the Bunny Stream iframe built from stream_id.
    // Google requires every VideoObject to carry contentUrl or embedUrl, so a
    // row with no playable source at all is not emitted as a video node.
    const embed = v.embed_url || streamIframeUrl(v.stream_id);
    if (!embed) return null;
    // When the video is linked to a catalog song (and that song's page exists),
    // point about/subjectOf at the song's MusicRecording @id -- says "this video
    // is OF this song", merging the two into one entity in the graph.
    const song = Array.isArray(v.song) ? v.song[0] : v.song;
    const songRef =
      song && song.status === "published" && song.slug
        ? { "@type": "MusicRecording", "@id": recordingId(song.slug) }
        : null;
    return {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      "@id": `${VIDEOS_URL}?v=${v.slug}#video`,
      name: v.seo_title || v.title,
      description: v.seo_description || v.description || `${v.title} -- a music video by Chad Lewine.`,
      url: `${VIDEOS_URL}?v=${v.slug}`,
      ...(thumb ? { thumbnailUrl: thumb } : {}),
      ...(uploaded ? { uploadDate: uploaded } : {}),
      ...(dur ? { duration: dur } : {}),
      embedUrl: embed,
      author: { "@id": ARTIST_ID },
      creator: { "@id": ARTIST_ID },
      ...(songRef ? { about: songRef, subjectOf: songRef } : {}),
    };
  }).filter((node): node is NonNullable<typeof node> => node !== null);

  // Collection wrapper, each entry pointing at its VideoObject node by @id.
  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Videos - Chad Lewine",
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
          <h1 id="pantheon-hero-heading" className="pantheon-hero__title">Chad Lewine Videos</h1>
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
