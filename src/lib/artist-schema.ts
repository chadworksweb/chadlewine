// Canonical artist identity for schema.org structured data.
//
// One artist entity, referenced everywhere by a stable @id so Google can merge
// every MusicRecording, the WebSite, and the catalog list into a single node in
// its Knowledge Graph. See the Song Visibility Plan build-binder doc.

export const SITE_URL = "https://chadlewine.com";

// The recording artist (MusicGroup). Songs' byArtist points here.
export const ARTIST_ID = `${SITE_URL}/chad-lewine#artist`;
// The human (Person). Member of the MusicGroup above.
export const PERSON_ID = `${SITE_URL}/chad-lewine#person`;

// Entity-reconciliation targets. Google reads sameAs to connect this site's
// artist to its Knowledge Graph entity -- the single most important off-site
// link. Filled Phase 2D of the Song Visibility Plan once the open-database
// profiles existed; linking is now bidirectional (each DB points its
// official-homepage relationship back at chadlewine.com).
export const ARTIST_SAME_AS: string[] = [
  "https://musicbrainz.org/artist/ad48b14b-a3ed-41f8-b12c-ed3babe60f56",
  "https://www.wikidata.org/wiki/Q140089858",
  "https://www.discogs.com/artist/17822181",
];

// Set once a primary genre is decided (e.g. ["Indie", "Singer-Songwriter"]).
export const ARTIST_GENRE: string[] = [];

// A lean reference to the artist node for use as byArtist on recordings.
// The full node (image, description, sameAs, member) is declared once in
// SiteJsonLd via @id, so a reference is enough everywhere else.
export function artistRef() {
  return { "@type": "MusicGroup", "@id": ARTIST_ID, name: "Chad Lewine" };
}

// Turn a stored image path into an absolute URL (JSON-LD requires absolute).
// Mirrors the absoluteUrl convention used by the sitemap.
export function absoluteImage(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  if (path.startsWith("/")) return `${SITE_URL}${path}`;
  return `${SITE_URL}/${path}`;
}

// Seconds -> ISO 8601 duration (e.g. 225 -> "PT3M45S"). Undefined when absent.
export function isoDuration(totalSeconds?: number | null): string | undefined {
  if (!totalSeconds || totalSeconds <= 0) return undefined;
  const s = Math.round(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const out = `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${sec ? `${sec}S` : ""}`;
  return out === "PT" ? "PT0S" : out;
}

// Stable @id for a song's MusicRecording node, so the catalog list and the
// detail page describe the same node rather than two competing ones.
export function recordingId(slug: string): string {
  return `${SITE_URL}/music/songs/${slug}#recording`;
}
