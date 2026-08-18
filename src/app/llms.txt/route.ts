// llms.txt -- a plain-language map of the site for language models.
//
// robots.txt already permits every AI crawler (User-Agent: * / Allow: /), and
// the sitemaps already enumerate every URL. What neither does is say what this
// site IS, or which handful of routes matter, so a model answering a question
// about Chad Lewine has to infer the shape of the site from whatever page it
// happened to land on.
//
// The prose here is deliberately not new marketing copy: the summary and the
// description are the same strings the schema.org graph already publishes in
// SiteJsonLd, so the site describes itself the same way everywhere.

export const dynamic = "force-static";

const BODY = `# Chad Lewine

> Chad Lewine is a metaphysical artist creating and distributing original music, art and thoughts to empower the individual and the collective.

Independent musician and songwriter. An original catalog of songs, with art, merch, and live shows. Everything on this site is published directly by the artist.

## Start here

- [Music](https://chadlewine.com/music): the song catalog and the releases
- [Art](https://chadlewine.com/art): original pieces, catalogued at their true measured size
- [Videos](https://chadlewine.com/videos): video for the catalog
- [Merch](https://chadlewine.com/merch): shirts and goods
- [Writing](https://chadlewine.com/read): observations, journal entries and longer pieces

## About

- [Chad Lewine](https://chadlewine.com/chad-lewine): the artist, and the canonical entity this site describes

## Machine-readable

- [Sitemap index](https://chadlewine.com/sitemap.xml)
- [Songs](https://chadlewine.com/sitemap-songs.xml)
- [Releases](https://chadlewine.com/sitemap-releases.xml)
- [Art](https://chadlewine.com/sitemap-art.xml)
- [Observations](https://chadlewine.com/sitemap-observations.xml)

## Structured data

Every page carries a schema.org graph holding a WebSite, a Person and a
MusicGroup node, cross-linked by stable @id. Song pages add a MusicRecording
node that references the artist node as byArtist, so recordings, the site and
the human resolve to one entity rather than three unrelated ones. The artist
node also carries sameAs links to MusicBrainz, Wikidata and Discogs, and each
of those points its official-homepage relationship back here.
`;

export function GET() {
  return new Response(BODY, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
