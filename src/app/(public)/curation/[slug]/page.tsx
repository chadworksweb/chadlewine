import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPublicClient } from "@/lib/supabase-server";
import { RisingCompassBadge } from "@/components/RisingCompassBadge";

export const revalidate = 60;

interface CuratedEntry {
  id: string;
  type: string;
  title: string;
  slug: string;
  artist_name: string;
  description: string | null;
  body: string | null;
  cover_image_path: string | null;
  outbound_url: string | null;
  outbound_links: { platform: string; url: string }[] | null;
  rising_compass_score: number | null;
  rising_compass_classification: string | null;
  genre: string | null;
  mood_tags: string[] | null;
  seo_title: string | null;
  seo_description: string | null;
  published_at: string | null;
}

interface PlaylistTrack {
  id: string;
  track_title: string;
  artist_name: string;
  outbound_url: string | null;
  rising_compass_score: number | null;
  display_order: number;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("curated_entries")
    .select("title, artist_name, seo_title, seo_description, description, cover_image_path")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (!data) return { title: "Not Found" };

  const title = data.seo_title || `${data.title} by ${data.artist_name} — Curation — Chad Lewine`;
  const description = data.seo_description || data.description || `${data.title} by ${data.artist_name}, curated by Chad Lewine.`;

  return {
    title,
    description,
    alternates: { canonical: `https://chadlewine.com/curation/${slug}` },
    openGraph: {
      title,
      description,
      ...(data.cover_image_path ? { images: [{ url: data.cover_image_path }] } : {}),
    },
  };
}

export default async function CurationEntryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = createPublicClient();

  const { data: entry } = await supabase
    .from("curated_entries")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .single();

  if (!entry) notFound();

  const e = entry as CuratedEntry;

  let tracks: PlaylistTrack[] = [];
  if (e.type === "playlist") {
    const { data } = await supabase
      .from("curated_playlist_tracks")
      .select("*")
      .eq("playlist_id", e.id)
      .order("display_order");
    tracks = (data || []) as PlaylistTrack[];
  }

  const allLinks = [
    ...(e.outbound_url ? [{ platform: "Listen", url: e.outbound_url }] : []),
    ...(e.outbound_links || []),
  ];

  // Structured data
  const schemaType = e.type === "playlist" ? "MusicPlaylist" : e.type === "single" ? "MusicRecording" : "MusicAlbum";
  const structuredData = {
    "@context": "https://schema.org",
    "@type": schemaType,
    name: e.title,
    byArtist: { "@type": "MusicGroup", name: e.artist_name },
    ...(e.description ? { description: e.description } : {}),
    ...(e.cover_image_path ? { image: e.cover_image_path } : {}),
    ...(e.published_at ? { datePublished: e.published_at } : {}),
    ...(e.type === "playlist" && tracks.length > 0
      ? {
          numTracks: tracks.length,
          track: tracks.map((t, i) => ({
            "@type": "MusicRecording",
            name: t.track_title,
            byArtist: { "@type": "MusicGroup", name: t.artist_name },
            position: i + 1,
          })),
        }
      : {}),
  };

  return (
    <div id="page-curation-entry" className="page-static">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div className="curation-entry">
        {/* Hero */}
        <div className="curation-entry__hero">
          {e.cover_image_path ? (
            <img src={e.cover_image_path} alt={e.title} className="curation-entry__cover" />
          ) : (
            <div className="curation-entry__cover curation-entry__cover--empty" />
          )}

          <div className="curation-entry__meta">
            <span className="curation-entry__type">{e.type}</span>
            <h1 className="curation-entry__title">{e.title}</h1>
            <p className="curation-entry__artist">{e.artist_name}</p>

            {e.rising_compass_score != null && (
              <RisingCompassBadge
                score={e.rising_compass_score}
                classification={e.rising_compass_classification}
              />
            )}

            {e.genre && <span className="curation-entry__genre">{e.genre}</span>}

            {e.mood_tags && e.mood_tags.length > 0 && (
              <div className="curation-entry__moods">
                {e.mood_tags.map(tag => (
                  <span key={tag} className="curation-entry__mood-tag">{tag}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Listen links */}
        {allLinks.length > 0 && (
          <div className="curation-entry__links">
            {allLinks.map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="curation-entry__platform-btn"
              >
                {link.platform}
              </a>
            ))}
          </div>
        )}

        {/* Editorial body */}
        {e.body && (
          <div className="curation-entry__body" dangerouslySetInnerHTML={{ __html: e.body }} />
        )}

        {/* Playlist tracks */}
        {e.type === "playlist" && tracks.length > 0 && (
          <div className="curation-entry__playlist">
            <h2 className="curation-entry__playlist-heading">Tracks</h2>
            <ol className="curation-entry__tracklist">
              {tracks.map(t => (
                <li key={t.id} className="curation-entry__track">
                  <span className="curation-entry__track-title">{t.track_title}</span>
                  <span className="curation-entry__track-artist">{t.artist_name}</span>
                  {t.rising_compass_score != null && (
                    <RisingCompassBadge score={t.rising_compass_score} size="sm" />
                  )}
                  {t.outbound_url && (
                    <a href={t.outbound_url} target="_blank" rel="noopener noreferrer" className="curation-entry__track-link">Listen</a>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
