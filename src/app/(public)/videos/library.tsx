// Shared body for both video routes: /videos (the whole library) and
// /videos/[slug] (one video already on the stage). Not a route file -- only
// page/layout/route are special in the app dir, so this sits here next to the
// two pages that use it rather than in components/, because it is a server
// component that owns their data fetch.
//
// Keeping one body is the point: the collection, the JSON-LD graph and the
// temple are identical on both routes, and the only difference is which video
// starts enshrined. Two copies would drift.

import { VideoPantheon } from "@/components/VideoPantheon";
import { ARTIST_ID, absoluteImage, isoDuration, recordingId } from "@/lib/artist-schema";
import { streamIframeUrl } from "@/lib/bunny-stream";
import { VIDEOS_URL, videoUrl, fetchLibrary } from "./data";

function uploadIso(published_at: string | null): string | undefined {
  if (!published_at) return undefined;
  const d = new Date(published_at);
  return isNaN(d.getTime()) ? undefined : d.toISOString();
}

export async function VideoLibrary({ activeSlug }: { activeSlug?: string | null }) {
  const { categories, videos: rows } = await fetchLibrary();

  // One VideoObject per video -- thumbnail, upload date, and duration make these
  // eligible for Google video results; author ties each to the artist entity.
  const videoNodes = rows.map((v) => {
    const thumb = absoluteImage(v.thumbnail_path);
    const uploaded = uploadIso(v.published_at ?? null);
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
      "@id": `${videoUrl(v.slug)}#video`,
      name: v.seo_title || v.title,
      description: v.seo_description || v.description || `${v.title}, a video by Chad Lewine.`,
      url: videoUrl(v.slug),
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
      url: videoUrl(v.slug),
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
        <VideoPantheon
          categories={categories}
          videos={rows}
          activeSlug={activeSlug ?? null}
        />
      )}
    </div>
  );
}
