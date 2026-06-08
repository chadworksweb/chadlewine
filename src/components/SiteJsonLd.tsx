import {
  SITE_URL,
  ARTIST_ID,
  PERSON_ID,
  ARTIST_SAME_AS,
  ARTIST_GENRE,
} from "@/lib/artist-schema";

// Site-wide identity graph, rendered on every page. One @graph so the WebSite,
// the Person (the human), and the MusicGroup (the recording artist) cross-link
// by @id. Every MusicRecording on the site references ARTIST_ID as byArtist, so
// this is where that node is actually defined.
export function SiteJsonLd() {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}#website`,
        name: "Chad Lewine",
        url: SITE_URL,
        description:
          "Chad Lewine - musician. Songs at the center of a catalog that tells a life. Art, merch, and live shows.",
        publisher: { "@id": PERSON_ID },
      },
      {
        "@type": "Person",
        "@id": PERSON_ID,
        name: "Chad Lewine",
        url: `${SITE_URL}/chad-lewine`,
        image: `${SITE_URL}/chad-lewine-portrait.webp`,
        hasOccupation: [
          { "@type": "Occupation", name: "Musician" },
          { "@type": "Occupation", name: "Songwriter" },
        ],
        knowsAbout: [
          "Music",
          "Songwriting",
          "Technology",
          "Business Strategy",
          "Applied Thinking",
          "Consciousness",
          "Identity",
          "Faith",
          "Economics",
        ],
        ...(ARTIST_SAME_AS.length ? { sameAs: ARTIST_SAME_AS } : {}),
      },
      {
        "@type": "MusicGroup",
        "@id": ARTIST_ID,
        name: "Chad Lewine",
        url: `${SITE_URL}/chad-lewine`,
        image: `${SITE_URL}/chad-lewine-portrait.webp`,
        description:
          "Independent musician and songwriter. An original catalog of songs, with art, merch, and live shows.",
        member: { "@id": PERSON_ID },
        ...(ARTIST_GENRE.length ? { genre: ARTIST_GENRE } : {}),
        ...(ARTIST_SAME_AS.length ? { sameAs: ARTIST_SAME_AS } : {}),
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph) }}
    />
  );
}
