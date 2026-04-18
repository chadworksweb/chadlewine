interface ArtPieceJsonLdProps {
  title: string;
  url: string;
  image: string;
  imageAlt?: string | null;
  artSummary?: string | null;
  description?: string | null;
  citationSummary?: string | null;
  medium?: string | null;
  dimensions?: string | null;
  yearCreated?: number | null;
  focusKeyphrase?: string | null;
  secondaryKeyphrases?: string[];
  paaPairs?: { question: string; answer: string }[];
}

export function ArtPieceJsonLd({
  title,
  url,
  image,
  imageAlt,
  artSummary,
  description,
  citationSummary,
  medium,
  dimensions,
  yearCreated,
  focusKeyphrase,
  secondaryKeyphrases = [],
  paaPairs = [],
}: ArtPieceJsonLdProps) {
  const artwork: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "VisualArtwork",
    name: title,
    url,
    image: {
      "@type": "ImageObject",
      url: image,
      ...(imageAlt ? { caption: imageAlt } : {}),
    },
    creator: {
      "@type": "Person",
      "@id": "https://chadlewine.com/chad-lewine#person",
      name: "Chad Lewine",
    },
    artist: {
      "@type": "Person",
      "@id": "https://chadlewine.com/chad-lewine#person",
      name: "Chad Lewine",
    },
  };

  const desc = citationSummary || artSummary || description;
  if (desc) artwork.description = desc;
  if (medium) artwork.artMedium = medium;
  if (dimensions) artwork.artworkSurface = dimensions;
  if (yearCreated) artwork.dateCreated = String(yearCreated);
  if (focusKeyphrase || secondaryKeyphrases.length > 0) {
    artwork.keywords = [focusKeyphrase, ...secondaryKeyphrases].filter(Boolean).join(", ");
  }

  const schemas: Record<string, unknown>[] = [artwork];

  if (paaPairs.length > 0) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: paaPairs.map((p) => ({
        "@type": "Question",
        name: p.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: p.answer,
        },
      })),
    });
  }

  return (
    <>
      {schemas.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
    </>
  );
}
