interface MuralLocation {
  venueName?: string | null;
  venueUrl?: string | null;
  streetAddress?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  completionDate?: string | null;
  publicTopics?: string[] | null;
}

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
  muralLocation?: MuralLocation | null;
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
  muralLocation = null,
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

  const kw = [focusKeyphrase, ...secondaryKeyphrases, ...(muralLocation?.publicTopics || [])]
    .filter((s): s is string => !!s);
  if (kw.length > 0) artwork.keywords = Array.from(new Set(kw)).join(", ");

  const schemas: Record<string, unknown>[] = [artwork];

  if (muralLocation && (muralLocation.city || muralLocation.latitude != null || muralLocation.venueName)) {
    const address: Record<string, unknown> = { "@type": "PostalAddress" };
    if (muralLocation.streetAddress) address.streetAddress = muralLocation.streetAddress;
    if (muralLocation.neighborhood) address.addressLocality = muralLocation.neighborhood;
    else if (muralLocation.city) address.addressLocality = muralLocation.city;
    if (muralLocation.city && muralLocation.neighborhood) address.addressRegion = muralLocation.city;
    else if (muralLocation.region) address.addressRegion = muralLocation.region;
    if (muralLocation.country) address.addressCountry = muralLocation.country;

    const place: Record<string, unknown> = { "@type": "Place" };
    if (muralLocation.venueName) place.name = muralLocation.venueName;
    if (Object.keys(address).length > 1) place.address = address;
    if (muralLocation.latitude != null && muralLocation.longitude != null) {
      place.geo = {
        "@type": "GeoCoordinates",
        latitude: muralLocation.latitude,
        longitude: muralLocation.longitude,
      };
    }
    if (muralLocation.venueUrl) place.url = muralLocation.venueUrl;

    artwork.contentLocation = place;
    artwork.locationCreated = place;
    if (muralLocation.completionDate) artwork.dateCreated = muralLocation.completionDate;
  }

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
