import type { RisingCompassBadgeData } from "@/lib/rising-compass";
import {
  SITE_URL,
  artistRef,
  absoluteImage,
  recordingId,
} from "@/lib/artist-schema";

interface AlbumTrack {
  title: string;
  slug: string;
}

interface AlbumChargeJsonLdProps {
  albumTitle: string;
  albumSlug: string;
  releaseDate?: string | null;
  imagePath?: string | null;
  releaseType?: string | null;
  tracks: AlbumTrack[];
  badge?: RisingCompassBadgeData | null;
  citationSummary?: string | null;
}

// schema.org MusicAlbumReleaseType for the release shape.
function albumReleaseType(t?: string | null): string {
  switch (t) {
    case "ep":
      return "https://schema.org/EPRelease";
    case "single":
      return "https://schema.org/SingleRelease";
    default:
      return "https://schema.org/AlbumRelease";
  }
}

// A release page's MusicAlbum node. byArtist points at the canonical artist
// @id; each track's @id matches the MusicRecording emitted on that song's detail
// page, so the album, its tracks, and the artist form one cohesive graph.
export function AlbumChargeJsonLd({
  albumTitle,
  albumSlug,
  releaseDate,
  imagePath,
  releaseType,
  tracks,
  badge,
  citationSummary,
}: AlbumChargeJsonLdProps) {
  const albumUrl = `${SITE_URL}/music/releases/${albumSlug}`;
  const image = absoluteImage(imagePath);

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

  const jsonLd: Record<string, unknown> = {
    "@context": context,
    "@type": "MusicAlbum",
    "@id": `${albumUrl}#album`,
    name: albumTitle,
    url: albumUrl,
    byArtist: artistRef(),
    albumReleaseType: albumReleaseType(releaseType),
    ...(releaseType === "compilation"
      ? { albumProductionType: "https://schema.org/CompilationAlbum" }
      : {}),
    numTracks: tracks.length,
    track: tracks.map((t) => ({
      "@type": "MusicRecording",
      "@id": recordingId(t.slug),
      name: t.title,
      url: `${SITE_URL}/music/songs/${t.slug}`,
    })),
    ...(releaseDate ? { datePublished: releaseDate } : {}),
    ...(image ? { image } : {}),
  };

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

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
