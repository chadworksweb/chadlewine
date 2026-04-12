import type { RisingCompassBadgeData } from "@/lib/rising-compass";

interface SongChargeJsonLdProps {
  songTitle: string;
  songUrl: string;
  albumTitle: string;
  albumUrl: string;
  badge: RisingCompassBadgeData;
  citationSummary?: string | null;
  focusKeyphrase?: string | null;
  secondaryKeyphrases?: string[];
  paaPairs?: { question: string; answer: string }[];
}

export function SongChargeJsonLd({
  songTitle,
  songUrl,
  albumTitle,
  albumUrl,
  badge,
  citationSummary,
  focusKeyphrase,
  secondaryKeyphrases = [],
  paaPairs = [],
}: SongChargeJsonLdProps) {
  const jsonLd = {
    "@context": [
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
    ],
    "@type": "MusicRecording",
    name: songTitle,
    url: songUrl,
    byArtist: {
      "@type": "Person",
      "@id": "https://chadlewine.com/chad-lewine#person",
      name: "Chad Lewine",
    },
    inAlbum: {
      "@type": "MusicAlbum",
      name: albumTitle,
      url: albumUrl,
    },
    review: {
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
    },
    additionalProperty: [
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
    ],
    lyricalCharge: {
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
    },
    ...(citationSummary ? { description: citationSummary } : {}),
    ...((focusKeyphrase || secondaryKeyphrases.length > 0) ? {
      keywords: [focusKeyphrase, ...secondaryKeyphrases].filter(Boolean).join(", "),
    } : {}),
  };

  const schemas: Record<string, unknown>[] = [jsonLd];

  if (paaPairs.length > 0) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: paaPairs.map((pair) => ({
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
