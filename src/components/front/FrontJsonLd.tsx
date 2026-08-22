import type { FrontPost, FrontRelease, FrontVideo } from "@/lib/front-data";
import { SITE_URL, ARTIST_ID, PERSON_ID } from "@/lib/artist-schema";

// Same constant the rest of the schema layer uses, aliased for brevity below.
const BASE = SITE_URL;

// The door's structured data, and the reason stripping the page back costs less
// than it looks like it should.
//
// SiteJsonLd (root layout) already publishes the WebSite, Person and MusicGroup
// nodes on every route, so the entity graph is untouched by anything that
// happens here. What that graph does NOT say is what is NEW, and the old
// homepage answered that in prose an answer engine had to read off a feed.
//
// This says it in a form that needs no reading: an ItemList naming the current
// release, video and post, each pointing at its own canonical page where the
// full MusicAlbum / VideoObject / Article node lives. Plus a
// SiteNavigationElement, which is the honest way to publish the site's shape
// from a page whose visible navigation is six rows -- the links a reader can
// reach from here, declared as such.
//
// @id values reference the root graph's nodes rather than redefining them.
// Two Person nodes describing one human is worse than none.
export function FrontJsonLd({
  release,
  video,
  post,
}: {
  release: FrontRelease | null;
  video: FrontVideo | null;
  post: FrontPost | null;
}) {
  const items: Record<string, unknown>[] = [];

  if (release) {
    items.push({
      "@type": "MusicAlbum",
      "@id": `${BASE}${release.href}#album`,
      name: release.title,
      url: `${BASE}${release.href}`,
      byArtist: { "@id": ARTIST_ID },
      ...(release.releaseDate ? { datePublished: release.releaseDate } : {}),
      ...(release.coverPath ? { image: absolute(release.coverPath) } : {}),
      ...(release.summary ? { description: release.summary } : {}),
      ...(release.trackCount ? { numTracks: release.trackCount } : {}),
    });
  }

  if (video) {
    items.push({
      "@type": "VideoObject",
      "@id": `${BASE}${video.href}#video`,
      name: video.title,
      url: `${BASE}${video.href}`,
      // uploadDate is REQUIRED by Google's video structured-data spec, so a
      // video with no published_at is published without the node rather than
      // with an invalid one.
      ...(video.publishedAt ? { uploadDate: video.publishedAt } : {}),
      ...(video.description ? { description: video.description } : {}),
      ...(video.thumbnail ? { thumbnailUrl: absolute(video.thumbnail) } : {}),
    });
  }

  if (post) {
    items.push({
      "@type": "Article",
      "@id": `${BASE}${post.href}#article`,
      headline: post.title,
      url: `${BASE}${post.href}`,
      author: { "@id": PERSON_ID },
      ...(post.dateCaptured ? { datePublished: post.dateCaptured } : {}),
      ...(post.lede ? { description: post.lede } : {}),
    });
  }

  const graph: Record<string, unknown>[] = [
    {
      "@type": "SiteNavigationElement",
      "@id": `${BASE}/#frontnav`,
      name: ["Discography", "About", "Music", "Videos", "Writing", "Merch", "Art"],
      url: [
        `${BASE}/discography`,
        `${BASE}/chad-lewine`,
        `${BASE}/music`,
        `${BASE}/videos`,
        `${BASE}/read`,
        `${BASE}/merch`,
        `${BASE}/art`,
      ],
    },
  ];

  if (items.length > 0) {
    graph.push({
      "@type": "ItemList",
      "@id": `${BASE}/#latest`,
      name: "Latest from Chad Lewine",
      itemListOrder: "https://schema.org/ItemListUnordered",
      numberOfItems: items.length,
      itemListElement: items.map((item, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item,
      })),
    });
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }),
      }}
    />
  );
}

function absolute(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return path.startsWith("/") ? `${BASE}${path}` : `${BASE}/${path}`;
}
