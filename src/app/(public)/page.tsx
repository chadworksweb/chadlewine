import Link from "next/link";
import { createPublicClient } from "@/lib/supabase-server";
import { CoverHero } from "@/components/CoverHero";
import { FeedEntry } from "@/components/FeedEntry";
import { FeaturedTrack } from "@/components/FeaturedTrack";
import { formatDate } from "@/lib/utils";

export const revalidate = 60;

async function getObservations() {
  const supabase = createPublicClient();

  const { data: observations } = await supabase
    .from("observations")
    .select("id, title, slug, date_captured, art_image_path, art_alt, hook_line, status")
    .eq("status", "published")
    .order("date_captured", { ascending: false });

  if (!observations || observations.length === 0) return [];

  return observations;
}

async function getFeaturedTrack() {
  const supabase = createPublicClient();

  const { data: song } = await supabase
    .from("songs")
    .select("id, title, slug, duration_seconds, streaming_path, song_summary")
    .eq("featured", true)
    .limit(1)
    .maybeSingle();

  if (!song) return null;

  // Get album via junction
  const { data: junction } = await supabase
    .from("album_songs")
    .select("track_number, album:albums(title, slug, cover_art_path, cover_art_alt)")
    .eq("song_id", song.id)
    .limit(1)
    .maybeSingle();

  if (!junction?.album) return null;

  const album = Array.isArray(junction.album) ? junction.album[0] : junction.album;

  return {
    song: { ...song, track_number: junction.track_number },
    album,
  };
}

async function getMeditations() {
  const supabase = createPublicClient();

  const { data: meditations } = await supabase
    .from("meditations")
    .select("id, subtitle, body, plain_text, published_at, created_at")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(10);

  return meditations || [];
}

export default async function HomePage() {
  const [observations, meditations, featuredTrack] = await Promise.all([
    getObservations(),
    getMeditations(),
    getFeaturedTrack(),
  ]);

  const latest = observations[0];
  const feed = observations.slice(1);

  return (
    <div id="page-home" className="page-home">
      {latest && (
        <CoverHero
          title={latest.title}
          slug={latest.slug}
          dateCaptured={latest.date_captured}
          hookLine={latest.hook_line || ""}
          artImageUrl={latest.art_image_path || ""}
          artAlt={latest.art_alt || latest.title}
        />
      )}

      <div className="home-split">
        {/* Left 2/3 — Observation archive */}
        <section className="home-split__observations">
          {feed.length > 0 && (
            <>
              <div className="archive__feed">
                {feed.map((obsv) => (
                  <FeedEntry
                    key={obsv.slug}
                    title={obsv.title}
                    slug={obsv.slug}
                    dateCaptured={obsv.date_captured}
                    hookLine={obsv.hook_line || ""}
                    artImageUrl={obsv.art_image_path || ""}
                    artAlt={obsv.art_alt || obsv.title}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        {/* Right 1/3 — Featured Track + Meditations */}
        {(featuredTrack || meditations.length > 0) && (
          <aside className="home-split__meditations">
            {featuredTrack && (
              <FeaturedTrack song={featuredTrack.song} album={featuredTrack.album} />
            )}
            {meditations.length > 0 && (
              <>
              <h2 className="home-split__meditations-heading">Meditations</h2>
            <div className="home-split__meditations-feed">
              {meditations.map((med) => (
                <Link
                  key={med.id}
                  href={`/meditations/${med.id}`}
                  className="home-med-row"
                >
                  <span className="home-med-row__label">{med.subtitle || "new meditation"}</span>
                  <span className="home-med-row__date">{new Date(med.published_at || med.created_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true })}</span>
                </Link>
              ))}
            </div>
            <Link href="/meditations" className="home-split__meditations-more">
              All Meditations
            </Link>
              </>
            )}
          </aside>
        )}
      </div>

      {observations.length === 0 && meditations.length === 0 && (
        <section className="empty-state">
          <p className="empty-state__message">No observations published yet.</p>
        </section>
      )}
    </div>
  );
}
