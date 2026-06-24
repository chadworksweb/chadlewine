import type { Metadata } from "next";
import Link from "next/link";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient } from "@/lib/supabase-server";
import { fetchBadge } from "@/lib/rising-compass";

export const revalidate = 300;

const ARTIST = "Chad Lewine";

const DEFAULT_METADATA: Metadata = {
  title: "Call for Music - Submit Your Highest-Vibe Songs",
  description:
    "Chad Lewine holds a Call for Music. Submit your highest-vibe songs to help lay the foundation of the world's foremost positive song database. Not a contest. Rising Compass measures, Chad Lewine curates.",
  alternates: { canonical: "https://chadlewine.com/call-for-music" },
  openGraph: {
    title: "Call for Music - Chad Lewine",
    description:
      "Submit your highest-vibe songs to a growing database of positively intentioned music. Rising Compass measures, Chad Lewine curates.",
    url: "https://chadlewine.com/call-for-music",
  },
};

const CALL_FOR_MUSIC_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "CreativeWork",
  name: "Call for Music",
  url: "https://chadlewine.com/call-for-music",
  creator: { "@type": "Person", name: "Chad Lewine", url: "https://chadlewine.com/chad-lewine" },
  description:
    "An evergreen, always-open call for submission to a curated database of positively intentioned songs. Rising Compass measures each song's charge; Chad Lewine curates what enters the canon.",
  inLanguage: "en",
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/call-for-music", DEFAULT_METADATA);
}

// Raw shape as Supabase returns FK joins: array or single object.
type Joined<T> = T | T[] | null;
function firstOrNull<T>(value: Joined<T> | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

interface GallerySong {
  id: string;
  title: string;
  slug: string;
  artUrl: string | null;
  artAlt: string | null;
  tierLabel: string | null;
  tierHex: string | null;
  charge: number | null;
}

// The seed gallery. Until curated submissions arrive, Chad's own published
// songs stand in as placeholder entries -- a living preview of what the
// positive song database looks like. Each card shows its live Rising Compass
// reading when RC has one.
async function fetchSeedGallery(): Promise<GallerySong[]> {
  const supabase = createPublicClient();

  const { data: songRows } = await supabase
    .from("songs")
    .select("id, title, slug, release_date, art_image_path, art_alt")
    .eq("status", "published")
    .order("release_date", { ascending: false })
    .limit(12);

  const songs = songRows || [];
  if (songs.length === 0) return [];

  // Album cover fallback for songs without their own art.
  const missingArtIds = songs.filter((s) => !s.art_image_path).map((s) => s.id);
  const albumArtBySong = new Map<string, { path: string | null; alt: string | null }>();
  if (missingArtIds.length > 0) {
    const { data: junctions } = await supabase
      .from("release_songs")
      .select("song_id, release:releases(cover_art_path, cover_art_alt, release_type)")
      .in("song_id", missingArtIds);
    for (const j of junctions || []) {
      const rel = firstOrNull(
        (j as { release: Joined<{ cover_art_path: string | null; cover_art_alt: string | null; release_type?: string | null }> }).release,
      );
      const songId = (j as { song_id: string }).song_id;
      if (rel?.cover_art_path && !albumArtBySong.has(songId)) {
        albumArtBySong.set(songId, { path: rel.cover_art_path, alt: rel.cover_art_alt });
      }
    }
  }

  // Live RC badges in parallel; any failure degrades to a card with no reading.
  const badges = await Promise.all(songs.map((s) => fetchBadge(s.title, ARTIST).catch(() => null)));

  return songs.map((s, i) => {
    const fallback = albumArtBySong.get(s.id);
    const badge = badges[i];
    return {
      id: s.id,
      title: s.title,
      slug: s.slug,
      artUrl: s.art_image_path || fallback?.path || null,
      artAlt: s.art_alt || fallback?.alt || s.title,
      tierLabel: badge?.tier_label ?? null,
      tierHex: badge?.tier_hex ?? null,
      charge: typeof badge?.charge === "number" ? badge.charge : null,
    };
  });
}

export default async function CallForMusicPage() {
  const gallery = await fetchSeedGallery();

  return (
    <div id="page-call-for-music" className="page-call-for-music">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(CALL_FOR_MUSIC_JSON_LD) }}
      />

      {/* Section 1 - Hero */}
      <section className="cfm-hero" aria-label="Call for Music">
        <div className="cfm-hero__inner">
          <h1 className="cfm-hero__eyebrow">Chad Lewine holds a</h1>
          <h2 className="cfm-hero__headline">Call for Music</h2>
          <p className="cfm-hero__sub">
            Submit your highest-vibe songs to a growing database of positively intentioned music.
          </p>
          <p className="cfm-hero__not-contest">
            This is not a contest. It is a call for submission to lay the foundation of the
            world&rsquo;s foremost positive song database.
          </p>
          <div className="cfm-hero__nav">
            <a href="#the-call" className="cfm-hero__nav-link">The Call</a>
            <a href="#how-it-works" className="cfm-hero__nav-link">How It Works</a>
            <a href="#gallery" className="cfm-hero__nav-link">The Database</a>
            <a href="#submit" className="cfm-hero__nav-link">Submit a Song</a>
          </div>
        </div>
      </section>

      {/* Section 2 - The Call */}
      <section className="cfm-section" id="the-call" aria-labelledby="cfm-call-heading">
        <div className="si-banner-bar">
          <div className="glyph-title-bar glyph-title-bar--top">
            <span className="glyph-title-bar__label" aria-hidden="true">&#9617;&#9618;&#9619;&#9608;</span>
            <h2 className="glyph-title-bar__heading" id="cfm-call-heading">The Call</h2>
            <span className="glyph-title-bar__label" aria-hidden="true">&#9608;&#9619;&#9618;&#9617;</span>
          </div>
        </div>
        <div className="si-prose cfm-prose">
          <p>
            For years I have made the case that most modern music keeps us trapped in lower
            vibrations, and that the songs raising us higher get buried under the noise. Pointing at
            the problem is not enough. So this is the other half of the work: gathering the songs
            that do the opposite.
          </p>
          <p>
            I am opening an ongoing, evergreen call to artists everywhere. Send me your highest-vibe
            songs, the ones built with positive intention, the ones that meet a listener where they
            are and carry them somewhere better. Together we lay the foundation of the world&rsquo;s
            foremost positive song database.
          </p>
          <p>
            <strong>To be clear: this is not a contest.</strong> There is no prize, no ranking, no
            winner. There is a canon being built, and an open invitation to be part of it.
          </p>
        </div>
      </section>

      {/* Section 3 - How it works: RC measures, Chad curates */}
      <section className="cfm-section" id="how-it-works" aria-labelledby="cfm-how-heading">
        <div className="si-banner-bar">
          <div className="glyph-title-bar glyph-title-bar--top">
            <span className="glyph-title-bar__label" aria-hidden="true">&#9617;&#9618;&#9619;&#9608;</span>
            <h2 className="glyph-title-bar__heading" id="cfm-how-heading">
              Rising Compass measures, Chad Lewine curates
            </h2>
            <span className="glyph-title-bar__label" aria-hidden="true">&#9608;&#9619;&#9618;&#9617;</span>
          </div>
        </div>

        <div className="cfm-roles">
          <div className="cfm-role">
            <p className="cfm-role__kicker">The measurement</p>
            <h3 className="cfm-role__title">Rising Compass reads the charge</h3>
            <p>
              Every submission is read by the{" "}
              <Link href="/super-individual#door-rc">Rising Compass</Link> calibration engine, the
              free tool I built to diagnose a song&rsquo;s positive or negative charge on a scale
              from Ascended down to Corrupted. The measurement is objective and applied to the song,
              not the artist.
            </p>
          </div>
          <div className="cfm-role">
            <p className="cfm-role__kicker">The curation</p>
            <h3 className="cfm-role__title">Chad decides what enters the canon</h3>
            <p>
              A high reading earns a song a real look. From there I curate by hand, listening for the
              intention behind the song and how it sits inside the larger collection. The database
              grows one deliberate choice at a time.
            </p>
          </div>
        </div>

        <div className="si-prose cfm-prose cfm-prose--centered">
          <p>
            Want to read your own song&rsquo;s frequency before you submit? Run it through the{" "}
            <Link href="/super-individual#door-rc">Rising Compass</Link> first.
          </p>
        </div>
      </section>

      {/* Section 4 - The growing database (gallery) */}
      <section className="cfm-section cfm-gallery-section" id="gallery" aria-labelledby="cfm-gallery-heading">
        <div className="si-banner-bar">
          <div className="glyph-title-bar glyph-title-bar--top">
            <span className="glyph-title-bar__label" aria-hidden="true">&#9617;&#9618;&#9619;&#9608;</span>
            <h2 className="glyph-title-bar__heading" id="cfm-gallery-heading">
              The positive song database
            </h2>
            <span className="glyph-title-bar__label" aria-hidden="true">&#9608;&#9619;&#9618;&#9617;</span>
          </div>
        </div>

        <p className="cfm-gallery__intro">
          The database is just getting started. For now, my own songs stand in as the founding
          entries, a preview of what a positively intentioned catalog looks like. Curated submissions
          join them as the call grows.
        </p>

        {gallery.length > 0 ? (
          <ul className="cfm-gallery">
            {gallery.map((song) => (
              <li key={song.id} className="cfm-card">
                <Link href={`/music/songs/${song.slug}`} className="cfm-card__link">
                  <div className="cfm-card__art">
                    {song.artUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={song.artUrl} alt={song.artAlt || song.title} className="cfm-card__img" />
                    ) : (
                      <div className="cfm-card__img cfm-card__img--placeholder" aria-hidden="true" />
                    )}
                    <span className="cfm-card__seed" aria-label="Founding entry">Seed</span>
                  </div>
                  <div className="cfm-card__body">
                    <span className="cfm-card__title">{song.title}</span>
                    <span className="cfm-card__artist">{ARTIST}</span>
                    {(song.tierLabel || song.charge != null) && (
                      <span className="cfm-card__rc">
                        {song.tierLabel && (
                          <span
                            className="cfm-card__tier"
                            style={song.tierHex ? { color: song.tierHex } : undefined}
                          >
                            {song.tierLabel}
                          </span>
                        )}
                        {song.charge != null && (
                          <span className="cfm-card__charge">
                            {song.charge > 0 ? "+" : ""}
                            {song.charge}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="cfm-gallery__empty">The database is being assembled. Check back shortly.</p>
        )}
      </section>

      {/* Section 5 - Submit */}
      <section className="cfm-section cfm-submit-section" id="submit" aria-labelledby="cfm-submit-heading">
        <div className="si-banner-bar">
          <div className="glyph-title-bar glyph-title-bar--top">
            <span className="glyph-title-bar__label" aria-hidden="true">&#9617;&#9618;&#9619;&#9608;</span>
            <h2 className="glyph-title-bar__heading" id="cfm-submit-heading">Submit a song</h2>
            <span className="glyph-title-bar__label" aria-hidden="true">&#9608;&#9619;&#9618;&#9617;</span>
          </div>
        </div>
        <p className="cfm-submit__intro">
          One song per submission. Paste the lyrics, the Rising Compass reads those. The song must
          be publicly available in some format, but the audio is not needed here. Send as many as you
          like, one at a time.
        </p>
        <div className="cfm-handoff">
          <p className="cfm-handoff__eyebrow">The call has a new home</p>
          <h3 className="cfm-handoff__head">
            Submissions now live at LEAM&rsquo;s High Vibe Song Database
          </h3>
          <p className="cfm-handoff__body">
            The positive song database has grown into its own home under Libra Engine Arts &amp;
            Media. The call is the same and the canon is the same. The door to submit is one click
            away.
          </p>
          <a
            className="cfm-handoff__cta"
            href="https://leam.libraengine.com/submit"
            target="_blank"
            rel="noopener noreferrer"
          >
            Submit your song at LEAM &rarr;
          </a>
          <p className="cfm-handoff__alt">
            Or{" "}
            <a href="https://leam.libraengine.com/open-call" target="_blank" rel="noopener noreferrer">
              read the open call
            </a>{" "}
            first.
          </p>
        </div>
      </section>
    </div>
  );
}
