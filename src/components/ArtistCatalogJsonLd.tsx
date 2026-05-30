import {
  SITE_URL,
  ARTIST_ID,
  ARTIST_SAME_AS,
  recordingId,
} from "@/lib/artist-schema";

// Catalog-level node for the songs index and the discography. Re-states the
// MusicGroup by the same @id as the global artist node, then enumerates the
// catalog via `track` (recordings) and/or `album` (releases). Each child @id
// matches the node emitted on that item's detail page, so Google sees one
// artist with one set of recordings and releases -- the data shape closest to
// the "Songs" carousel. Pass only items whose detail page actually resolves.
export function ArtistCatalogJsonLd({
  songs = [],
  albums = [],
}: {
  songs?: { title: string; slug: string }[];
  albums?: { title: string; slug: string }[];
}) {
  const node = {
    "@context": "https://schema.org",
    "@type": "MusicGroup",
    "@id": ARTIST_ID,
    name: "Chad Lewine",
    url: `${SITE_URL}/chad-lewine`,
    ...(ARTIST_SAME_AS.length ? { sameAs: ARTIST_SAME_AS } : {}),
    ...(songs.length
      ? {
          track: songs.map((s) => ({
            "@type": "MusicRecording",
            "@id": recordingId(s.slug),
            name: s.title,
            url: `${SITE_URL}/music/songs/${s.slug}`,
          })),
        }
      : {}),
    ...(albums.length
      ? {
          album: albums.map((a) => ({
            "@type": "MusicAlbum",
            "@id": `${SITE_URL}/music/releases/${a.slug}#album`,
            name: a.title,
            url: `${SITE_URL}/music/releases/${a.slug}`,
          })),
        }
      : {}),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }}
    />
  );
}
