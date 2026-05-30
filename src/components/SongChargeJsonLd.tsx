import type { RisingCompassBadgeData } from "@/lib/rising-compass";
import { artistRef, absoluteImage, isoDuration, recordingId } from "@/lib/artist-schema";

interface SectionQA {
  question: string;
  answer: string;
}

interface SongChargeJsonLdProps {
  songTitle: string;
  songSlug: string;
  songUrl: string;
  albumTitle?: string | null;
  albumUrl?: string | null;
  durationSeconds?: number | null;
  isrc?: string | null;
  releaseDate?: string | null;
  imagePath?: string | null;
  badge?: RisingCompassBadgeData | null;
  citationSummary?: string | null;
  focusKeyphrase?: string | null;
  secondaryKeyphrases?: string[];
  paaPairs?: { question: string; answer: string }[];
  sectionQAPairs?: SectionQA[];
}

export function SongChargeJsonLd({
  songTitle,
  songSlug,
  songUrl,
  albumTitle,
  albumUrl,
  durationSeconds,
  isrc,
  releaseDate,
  imagePath,
  badge,
  citationSummary,
  focusKeyphrase,
  secondaryKeyphrases = [],
  paaPairs = [],
  sectionQAPairs = [],
}: SongChargeJsonLdProps) {
  // The rc:* custom context only carries meaning when a Rising Compass badge is
  // present, so keep it off plain recordings.
  const context = badge
    ? [
        "https://schema.org",
        {
          rc: "https://risingcompass.net/schema/",
          lyricalCharge: "rc:LyricalCharge",
          chargeTier: "rc:ChargeTier",
          chargeValue: "rc:chargeValue",
          chargeSummary: "rc:chargeSummary",
          contaminated: "rc:contaminated",
          contaminationNote: "rc:contaminationNote",
        },
      ]
    : "https://schema.org";

  const image = absoluteImage(imagePath);
  const duration = isoDuration(durationSeconds);

  const jsonLd: Record<string, unknown> = {
    "@context": context,
    "@type": "MusicRecording",
    "@id": recordingId(songSlug),
    name: songTitle,
    url: songUrl,
    byArtist: artistRef(),
    ...(albumTitle && albumUrl
      ? { inAlbum: { "@type": "MusicAlbum", name: albumTitle, url: albumUrl } }
      : {}),
    ...(duration ? { duration } : {}),
    ...(isrc ? { isrcCode: isrc } : {}),
    ...(releaseDate ? { datePublished: releaseDate } : {}),
    ...(image ? { image } : {}),
  };

  // Rising Compass classification enrichment (review, properties, custom node).
  if (badge) {
    jsonLd.review = {
      "@type": "Rating",
      author: {
        "@type": "Organization",
        name: "Rising Compass",
        url: "https://risingcompass.net",
      },
      ratingValue: badge.charge,
      bestRating: 100,
      worstRating: -100,
      ratingExplanation: badge.charge_summary || undefined,
    };
    jsonLd.additionalProperty = [
      {
        "@type": "PropertyValue",
        propertyID: "RisingCompassTier",
        name: "Rising Compass Classification",
        value: badge.tier_label,
        description:
          "Five-tier lyrical consciousness classification by Rising Compass",
      },
      {
        "@type": "PropertyValue",
        propertyID: "RisingCompassTierColor",
        name: "Rising Compass Tier Color",
        value: badge.tier,
      },
      {
        "@type": "PropertyValue",
        propertyID: "RisingCompassCharge",
        name: "Rising Compass Charge Value",
        value: badge.charge,
        minValue: -100,
        maxValue: 100,
        unitText: "charge",
      },
      ...(badge.charge_summary
        ? [
            {
              "@type": "PropertyValue" as const,
              propertyID: "RisingCompassSummary",
              name: "Rising Compass Charge Summary",
              value: badge.charge_summary,
            },
          ]
        : []),
      {
        "@type": "PropertyValue",
        propertyID: "RisingCompassContaminated",
        name: "Rising Compass Contamination Flag",
        value: badge.contaminated,
      },
    ];
    jsonLd.lyricalCharge = {
      "@type": "rc:LyricalCharge",
      chargeTier: badge.tier_label,
      tierColor: badge.tier,
      chargeValue: badge.charge,
      chargeSummary: badge.charge_summary || undefined,
      contaminated: badge.contaminated,
      ...(badge.contamination_note
        ? { contaminationNote: badge.contamination_note }
        : {}),
      classifiedBy: {
        "@type": "Organization",
        name: "Rising Compass",
        url: "https://risingcompass.net",
      },
    };
  }

  if (citationSummary) jsonLd.description = citationSummary;
  if (focusKeyphrase || secondaryKeyphrases.length > 0) {
    jsonLd.keywords = [focusKeyphrase, ...secondaryKeyphrases]
      .filter(Boolean)
      .join(", ");
  }

  const schemas: Record<string, unknown>[] = [jsonLd];

  // Combine PAA pairs + section-level Q&A (from format stack headings + direct answers)
  const allFaqPairs = [...paaPairs, ...sectionQAPairs];
  if (allFaqPairs.length > 0) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: allFaqPairs.map((pair) => ({
        "@type": "Question",
        name: pair.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: pair.answer,
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
