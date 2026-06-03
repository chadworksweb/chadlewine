import type { Metadata } from "next";
import Link from "next/link";
import { mergeMetadata } from "@/lib/page-meta";
import { createPublicClient } from "@/lib/supabase-server";
import { getSingleSongIds } from "@/lib/song-singles";
import { ExploreSongs } from "@/components/ExploreSongs";
import { type SetlistSong, type SetlistTopic } from "@/components/SetlistPicker";
import { BookingInquiryForm } from "@/components/BookingInquiryForm";
import { WipeLink, BookingWipeTransition } from "@/components/BookingWipe";
import { PantheonStage, type PantheonVideo } from "@/components/PantheonStage";
import { SongVoiceGrid, type VoiceSong } from "@/components/SongVoiceGrid";
import { fetchBadge } from "@/lib/rising-compass";

export const revalidate = 60;

// --- Single source of truth for the page -------------------------------
const SUPER_INDIVIDUAL_URL = "/super-individual";

// The page lives at one route. The default state sells the night and pushes
// the host to EXPLORE the songs first; adding ?booking flips the same URL
// into the booking-inquiry state -- a Typeform-style form (BookingInquiryForm)
// that gathers the night and posts to /api/book.
const INQUIRY_HREF = "/super-individual-night?booking";

// The featured music video shown in the "Watch a music video" section. Matched
// by slug from the videos table -- swap this to feature a different one.
const FEATURED_VIDEO_SLUG = "johnny-boy-music-video-green-lane-park-edition";
// The song whose chad_quote shows beneath the featured video (ilike match).
const FEATURED_SONG_TITLE = "Johnny Boy";
// ------------------------------------------------------------------------

const DEFAULT_METADATA: Metadata = {
  title: "Super Individual Night",
  description:
    "Host Chad Lewine's Super Individual Night: a live original-song performance for ceremony spaces, sound-bath and ecstatic-dance rooms, listening rooms, studios, and galleries -- as much a gathering as a show. One-person load-in, you co-curate the set.",
  alternates: { canonical: "https://chadlewine.com/super-individual-night" },
  openGraph: {
    title: "Super Individual Night - Chad Lewine",
    description:
      "A live original-song performance for ceremony spaces, listening rooms, studios, and galleries -- as much a gathering as a show. You co-curate the set.",
    url: "https://chadlewine.com/super-individual-night",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/super-individual-night", DEFAULT_METADATA);
}

const BOOKING_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "MusicGroup",
  name: "Chad Lewine",
  url: "https://chadlewine.com",
  genre: ["Conscious Pop", "Transformational"],
  description:
    "Solo original-song performer presenting the Super Individual Night -- a live transmission for ceremony spaces, sound-bath and ecstatic-dance rooms, listening rooms, studios, retreats, and galleries. Voice over produced tracks; one-person load-in. Booking across the Lancaster-to-Philadelphia corridor and beyond.",
};

// --- Data --------------------------------------------------------------
// One lean catalog read feeds two features: the venue setlist picker (full
// catalog) and the ExploreSongs coverflow (a sampled taste). Mirrors the
// resolution logic on /music/songs but trimmed to what these two need.

// Albums curated out of browse surfaces (not deleted) -- mirrors the homepage
// and /api/explore-songs. Songs on these releases never enter the setlist
// picker or the coverflow.
const BROWSE_EXCLUDED_ALBUM_SLUGS = ["demoesque"];

type Joined<T> = T | T[] | null;
function firstOrNull<T>(value: Joined<T> | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

interface ExploreSong {
  id: string;
  title: string;
  slug: string;
  song_summary: string | null;
  art_image_path: string | null;
  art_alt: string | null;
  album: {
    title: string;
    slug: string;
    cover_art_path: string | null;
    cover_art_alt: string | null;
  } | null;
}

interface CatalogResult {
  setlistSongs: SetlistSong[];
  topics: SetlistTopic[];
  exploreSongs: ExploreSong[];
}

async function fetchCatalog(): Promise<CatalogResult> {
  const supabase = createPublicClient();

  const { data: songs } = await supabase
    .from("songs")
    .select("id, title, slug, status, song_summary, art_image_path, art_alt, instrumental")
    .in("status", ["unreleased", "published"]);

  if (!songs || songs.length === 0) {
    return { setlistSongs: [], topics: [], exploreSongs: [] };
  }

  const songIds = songs.map((s) => s.id);

  type ReleaseLite = {
    title: string;
    slug: string;
    cover_art_path: string | null;
    cover_art_alt: string | null;
    release_type: string | null;
  };
  type TopicLite = { label: string; slug: string };

  const [junctionsRes, topicLinksRes, allTopicsRes, singleIdsSet] = await Promise.all([
    supabase
      .from("release_songs")
      .select("song_id, release:releases(title, slug, cover_art_path, cover_art_alt, release_type)")
      .in("song_id", songIds),
    supabase
      .from("song_topics")
      .select("song_id, topic:topics(label, slug)")
      .in("song_id", songIds),
    supabase.from("topics").select("label, slug").order("label"),
    getSingleSongIds(supabase),
  ]);

  // Display album: prefer a real (non-single) release that has cover art.
  // Same pass flags songs on browse-excluded albums (e.g. "demoesque").
  const albumBySong: Record<string, ReleaseLite | null> = {};
  const excludedSongIds = new Set<string>();
  for (const row of (junctionsRes.data || []) as { song_id: string; release: Joined<ReleaseLite> }[]) {
    const rel = firstOrNull(row.release);
    if (!rel) continue;
    if (BROWSE_EXCLUDED_ALBUM_SLUGS.includes(rel.slug)) excludedSongIds.add(row.song_id);
    const current = albumBySong[row.song_id];
    const relIsAlbum = rel.release_type !== "single";
    const curIsAlbum = current ? current.release_type !== "single" : false;
    // Keep the first album-type release with art; only let a single fill an
    // empty slot, never overwrite an album.
    if (!current || (relIsAlbum && !curIsAlbum)) {
      albumBySong[row.song_id] = rel;
    }
  }

  const topicsBySong: Record<string, TopicLite[]> = {};
  for (const link of (topicLinksRes.data || []) as { song_id: string; topic: Joined<TopicLite> }[]) {
    const topic = firstOrNull(link.topic);
    if (!topic) continue;
    (topicsBySong[link.song_id] ||= []).push(topic);
  }

  // Only songs whose detail page resolves: published, plus unreleased singles.
  // Drop anything on a browse-excluded album (demoesque demos).
  const playable = songs.filter(
    (s) =>
      !excludedSongIds.has(s.id) &&
      (s.status === "published" || (s.status === "unreleased" && singleIdsSet.has(s.id))),
  );

  const setlistSongs: SetlistSong[] = playable
    .map((s) => {
      const alb = albumBySong[s.id];
      const art = s.art_image_path || alb?.cover_art_path || null;
      return {
        id: s.id,
        title: s.title,
        slug: s.slug,
        art,
        alt: s.art_alt || alb?.cover_art_alt || s.title,
        topics: topicsBySong[s.id] || [],
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  // Coverflow taste: songs with artwork only, instrumentals excluded, capped
  // so the stage is tidy.
  const exploreSongs: ExploreSong[] = playable
    .map((s) => {
      if (s.instrumental) return null;
      const alb = albumBySong[s.id];
      const art = s.art_image_path || alb?.cover_art_path || null;
      if (!art) return null;
      return {
        id: s.id,
        title: s.title,
        slug: s.slug,
        song_summary: s.song_summary,
        art_image_path: s.art_image_path,
        art_alt: s.art_alt,
        album: alb
          ? {
              title: alb.title,
              slug: alb.slug,
              cover_art_path: alb.cover_art_path,
              cover_art_alt: alb.cover_art_alt,
            }
          : null,
      };
    })
    .filter((x): x is ExploreSong => x !== null)
    .slice(0, 16);

  // Surface only themes a playable song carries, ordered by how many songs
  // carry them, so the picker can show the most useful themes first and tuck
  // the long tail (this catalog has ~100 topics) behind a "more" toggle.
  const topicCount = new Map<string, number>();
  for (const s of setlistSongs) {
    for (const t of s.topics) topicCount.set(t.slug, (topicCount.get(t.slug) || 0) + 1);
  }
  const topics = ((allTopicsRes.data || []) as SetlistTopic[])
    .filter((t) => topicCount.has(t.slug))
    .sort(
      (a, b) =>
        (topicCount.get(b.slug) || 0) - (topicCount.get(a.slug) || 0) ||
        a.label.localeCompare(b.label),
    );

  return { setlistSongs, topics, exploreSongs };
}

// --- Lifted verbatim from /songwriting: the "A Voice" example-song grid -----
interface RelJoin {
  cover_art_path: string | null;
  cover_art_alt: string | null;
  release_type: string | null;
}

async function fetchVoiceSongs(): Promise<VoiceSong[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("songs")
    .select(
      "id, slug, title, song_summary, streaming_path, duration_seconds, art_image_path, art_alt, playback_mode",
    )
    .eq("status", "published")
    .eq("available_for_a_voice", true)
    .order("voice_display_order", { ascending: true });
  const rows = data || [];

  // Fall back to the song's album cover when the song has no art of its own.
  const needArt = rows.filter((s) => !s.art_image_path).map((s) => s.id);
  const albumArt = new Map<string, { path: string; alt: string | null }>();
  if (needArt.length > 0) {
    const { data: junctions } = await supabase
      .from("release_songs")
      .select("song_id, release:releases(cover_art_path, cover_art_alt, release_type)")
      .in("song_id", needArt);
    for (const j of (junctions || []) as Array<{ song_id: string; release: RelJoin | RelJoin[] | null }>) {
      const rel = Array.isArray(j.release) ? j.release[0] : j.release;
      if (!rel || rel.release_type === "single") continue; // prefer album art
      if (rel.cover_art_path && !albumArt.has(j.song_id)) {
        albumArt.set(j.song_id, { path: rel.cover_art_path, alt: rel.cover_art_alt });
      }
    }
  }

  // Pull the compass charge live from Rising Compass (by title), same source as
  // the song detail page — the local songs.rc_charge column is only a partial
  // mirror (filled by the rc-classification webhook) and is null for most songs.
  const badges = await Promise.all(rows.map((s) => fetchBadge(s.title, "Chad Lewine")));

  return rows.map((s, i) => {
    const album = albumArt.get(s.id);
    return {
      id: s.id,
      slug: s.slug,
      title: s.title,
      summary: s.song_summary,
      artUrl: s.art_image_path || album?.path || null,
      artAlt: s.art_alt || album?.alt || null,
      streamingUrl: s.streaming_path,
      durationSeconds: s.duration_seconds,
      playbackMode: s.playback_mode === "full" ? "full" : "preview",
      rcCharge: badges[i]?.charge ?? null,
      rcColor: badges[i]?.tier_hex ?? null,
    };
  });
}

// One featured music video (resolved by slug) plus the Chad-quote from its
// companion song, both shaped for the booking "Watch a music video" section.
async function fetchFeaturedVideo(): Promise<{ video: PantheonVideo | null; quote: string | null }> {
  const supabase = createPublicClient();
  const [videoRes, songRes] = await Promise.all([
    supabase
      .from("videos")
      .select(
        "id, title, slug, category_id, stream_id, embed_url, thumbnail_path, description, is_featured, duration_seconds, published_at",
      )
      .eq("status", "published")
      .eq("slug", FEATURED_VIDEO_SLUG)
      .maybeSingle(),
    supabase
      .from("songs")
      .select("chad_quote")
      .ilike("title", FEATURED_SONG_TITLE)
      .limit(1)
      .maybeSingle(),
  ]);
  return {
    video: (videoRes.data as PantheonVideo) || null,
    quote: (songRes.data?.chad_quote as string | null) || null,
  };
}

// Stepped light-to-dark block glyph for the act cards. Uses four IDENTICAL
// full-block chars (U+2588) so every block shares one font + baseline and the
// row is always bottom-aligned; the gradient comes from opacity, not from the
// shade characters (which fall back to mismatched fonts on Windows).
function ActGlyph() {
  return (
    <span className="bk-act__glyph" aria-hidden="true">
      <span style={{ opacity: 0.22 }}>&#9608;</span>
      <span style={{ opacity: 0.45 }}>&#9608;</span>
      <span style={{ opacity: 0.7 }}>&#9608;</span>
      <span>&#9608;</span>
    </span>
  );
}

function GlyphTitle({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <div className="si-banner-bar">
      <div className="glyph-title-bar glyph-title-bar--top">
        <span className="glyph-title-bar__label" aria-hidden="true">&#9617;&#9618;&#9619;&#9608;</span>
        <h2 className="glyph-title-bar__heading" id={id}>{children}</h2>
        <span className="glyph-title-bar__label" aria-hidden="true">&#9608;&#9619;&#9618;&#9617;</span>
      </div>
    </div>
  );
}

// =======================================================================
// STATE A -- the overview / sales pitch. Its job is to sell the night and
// push the host to EXPLORE and LISTEN to the songs first (they will not know
// them by name). The only "next step" CTA is into the inquiry state.
// =======================================================================
function OverviewView({ exploreSongs, featuredVideo, featuredQuote, voiceSongs }: { exploreSongs: ExploreSong[]; featuredVideo: PantheonVideo | null; featuredQuote: string | null; voiceSongs: VoiceSong[] }) {
  return (
    <>
      {/* ============================================================
          SECTION: HERO (overview)   >> REWRITE IN YOUR VOICE <<
          JOB: In 3 seconds, make a ceremony-space host think "this fits
          MY calendar." The whole hook is sibling-to-a-sound-bath -- a
          real performance that belongs on a ceremony floor.
          WRITE: the eyebrow (who this is for), the name of the night,
          and 2-3 sentences that land the reframe: a performance that
          plays like a gathering; the same floor and intention as a sound bath.
          TONE: arresting, certain.  AVOID: "upbeat," "lifts the room,"
          and denying it is a performance.
          ============================================================ */}
      <section className="si-hero" aria-label="The Super Individual Night">
        <div className="si-hero__inner">
          <h1 className="si-hero__eyebrow">Introducing Chad Lewine&rsquo;s</h1>
          <h2 className="si-hero__headline">Super Individual Night</h2>
          <div className="si-hero__sub">
            <p>
              A live original-song transmission from Chad Lewine &mdash; built for the same rooms, the
              same floor, and the same intention as a sound bath. <strong>A performance, yes &mdash; but
              one that plays like a gathering.</strong> If your space already holds sound baths, ecstatic dance, breathwork,
              or kirtan, this is the song-based night that belongs on the very same calendar.
            </p>
          </div>
        </div>
      </section>

      {/* ============================================================
          SECTION: THE THREE ACTS   >> REWRITE IN YOUR VOICE <<
          JOB: Directly under the hero, show the shape of the night at a
          glance -- three movements -- so a host instantly gets that it is
          more than a set: a performance, a reckoning with where popular
          music and media have gone, and the Rising Compass placed in the
          room's hands.
          WRITE: a one-word kind, a title, and 1-2 lines per act. Replace
          "xyz" in act one with the real description of the set.
          TONE: confident, concrete.  AVOID: repeating the hero.
          ============================================================ */}
      <section className="si-section bk-program" aria-label="The night in three parts">
        <ol className="bk-acts">
          <li className="bk-act">
            <ActGlyph />
            <span className="bk-act__kind">The performance</span>
            <h3 className="bk-act__title">A live set of original songs</h3>
            <p className="bk-act__desc">
              Live vocals over fully produced tracks. Songs that sound like the radio but with messages
              the radio will never play. Loud enough to immerse the room, but not meant to emulate a
              rock concert.
            </p>
          </li>
          <li className="bk-act">
            <ActGlyph />
            <span className="bk-act__kind">The reckoning</span>
            <h3 className="bk-act__title">Where popular music &amp; media went</h3>
            <p className="bk-act__desc">
              A plain-spoken, interactive discussion examining what the mainstream and the algorithms
              feed us, and the impact it has on the individual psyche and society as a whole.
            </p>
          </li>
          <li className="bk-act">
            <ActGlyph />
            <span className="bk-act__kind">The compass</span>
            <h3 className="bk-act__title">Introduction to The Rising Compass</h3>
            <p className="bk-act__desc">
              A real-time, live presentation of{" "}
              <a href="https://risingcompass.net" target="_blank" rel="noopener noreferrer">
                The Rising Compass
              </a>
              , a tool I built that takes a daily reading of the USA&rsquo;s top 20 most popular
              songs and tells the truth about the messages coming from them.
            </p>
          </li>
        </ol>
        <div className="bk-cta">
          <WipeLink href={INQUIRY_HREF} className="bk-cta__btn bk-cta__btn--hollow">
            Send a booking inquiry
          </WipeLink>
        </div>
      </section>

      {/* ============================================================
          SECTION: WHAT IT IS   >> REWRITE IN YOUR VOICE <<
          JOB: Let a host picture the night on their actual floor.
          WRITE: the analogy (tone / breath / movement -> song), what
          physically happens in the room (lights low, people lie or sit,
          original songs written to raise frequency), and why it plays like
          a show and lands like ceremony. The 4 bullets are the at-a-glance essence.
          TONE: sensory, grounded, specific.  AVOID: hype and adjectives.
          ============================================================ */}
      <section id="what" className="si-door si-door--lead" aria-labelledby="bk-what-heading">
        <GlyphTitle id="bk-what-heading">What is Super Individual Night?</GlyphTitle>

        <div className="si-prose">
          <p style={{ fontSize: "1.3em", marginBottom: 0 }}>
            Super Individual Night is a music-driven experience that combines original music performance
            and thoughtful discussion on the landscape of popular music today. This event revolves around
            the idea that popular music can be positive, uplifting, and used for good, rather than purely
            entertainment, escapism, and background noise.
          </p>
        </div>

        <div className="bk-what__row">
          <div className="bk-what__half">
            <ul className="bk-checklist">
              <li><strong>Pop-format music as a healing modality.</strong> The same intention as a sound bath, ecstatic dance, drum circles and other spiritual/metaphysical events, just in a more accessible-to-mainstream format.</li>
              <li><strong>Songs that sound like the radio but say what the radio won&rsquo;t.</strong> Decades of study, distilled into hooks.</li>
              <li><strong>Not new age, not tribal, not contemporary pop.</strong> Lyrics and messages your soul actually feels comfortable singing.</li>
              <li><strong>Written for the sovereign.</strong> People already living outside the extractive mainstream, looking for music that knows their name.</li>
            </ul>
          </div>
          <div className="bk-what__art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/urgent-arbiter.webp"
              alt="Urgent Arbiter -- digital art by Chad Lewine"
              width={1920}
              height={980}
            />
          </div>
        </div>

        <div className="si-prose" style={{ marginTop: "var(--space-xl)", marginBottom: "var(--space-xl)" }}>
          <p>
            Sound baths transmit through tone. Lectures transmit through ideas. Energy healing transmits
            through presence. <strong>The Super Individual Night transmits through song.</strong>{" "}
            Pop-format music is the healing modality. Chad Lewine puts decades of metaphysical, spiritual,
            and socio-psychological study into original songs. The result is
            something you have not heard before: music that sounds and feels like what is on the radio
            today, but with lyrics and a message your soul actually feels comfortable singing.
          </p>
          <p>
            These are not new age songs. They are not kumbaya or tribal or world music. They are not
            contemporary pop either. They are original songs in a pop format, but written with the idea
            that popular music can be positive, uplifting, and used for good, rather than purely for
            entertainment, escapism, and background noise.
          </p>
          <p>
            For context, a <Link href={SUPER_INDIVIDUAL_URL}>Super Individual</Link>, by Chad&rsquo;s definition, is a sovereign human being who has reclaimed
            their power from the extractive institutions of modernity and operates outside of them. Much
            of your audience is probably already living a version of this, and this music is built for
            them. Super Individual is not a program or a belief system. There are no meetings, no
            structure to join. It is simply the phrase Chad uses to describe who his music is for and
            why he makes it.
          </p>
        </div>

        <div className="si-door__footer si-door__footer--center">
          <a href="#explore" className="explore-songs__cta">Hear the songs &rarr;</a>
        </div>
      </section>

      {/* ============================================================
          SECTION: WHY IT EXISTS (the honest struggle)
          >> REWRITE IN YOUR VOICE -- this is the emotional core, the
          section that most needs to be YOU <<
          JOB: Earn trust through radical honesty, and turn your pain
          (no home, audience does not exist yet, rejected by the
          institutions) into the REASON this room is the right door.
          WRITE: your real rejection story (mine the Super Individual /
          pop-up writing), the sonic-twin-but-lyrics-diverge truth (it
          sounds like commercial pop; the words are what set it apart),
          audience-as-a-disposition not a demographic that does not fully
          exist yet, and why a ceremony floor reaches these people when a
          club door never could.
          TONE: raw, vulnerable, zero spin.  AVOID: pitch-speak, self-pity.
          ============================================================ */}
      <section id="why" className="si-section" aria-labelledby="bk-why-heading">
        <GlyphTitle id="bk-why-heading">Why this event exists</GlyphTitle>

        <div className="bk-why__row">
          <div className="bk-why__body">
            <div className="bk-callout">
              <p>
                This event was created and is being pitched to spaces and communities
                like yours because traditional music venues just slam the door unless you have an audience
                already, and I&rsquo;ll be honest, I don&rsquo;t.
              </p>
              <p>
                My audience is not defined because it does not yet exist as a cohesive group. It is not a genre or a demographic. <strong>It
                is a disposition.</strong>
              </p>
              <p>
                My audience is people from all walks of life who feel somewhat displaced by
                the current popular culture. People who are seeking something that music used to be before
                digital technology and the internet mutated it into what we see and hear today. People who
                are done with music that keeps them complacent, degrades others, worships materialism or
                parades ego as empowerment.
              </p>
              <p>
                They are my audience, yet they aren&rsquo;t findable through modern marketing paradigms. They
                are next to impossible to reach through the algorithm or standard music spaces, but might be
                fairly easy to reach through spaces and communities like yours; spaces that say: this is a
                place where consciousness exists.
              </p>
            </div>
            <div className="si-door__footer">
              <Link href="/chad-lewine" className="explore-songs__cta">Learn more about me &rarr;</Link>
            </div>
          </div>
          <aside className="bk-why__portrait">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/super-individual/chad-lewine_the-deprogrammer_blue-glow.webp"
              alt="Chad Lewine -- portrait"
              width={806}
              height={1865}
            />
          </aside>
        </div>
      </section>

      {/* ============================================================
          SECTION: WHAT THE VENUE GETS   >> REWRITE IN YOUR VOICE <<
          JOB: De-risk the yes. Answer the host's real, practical worries.
          WRITE: 4-6 concrete benefits in a host's own language --
          calendar fit, no production burden, a different kind of night for
          their existing community, they co-curate, a repeatable Volume that
          brings people back. Speak to the room owner, not the listener.
          TONE: practical, generous, confident.  AVOID: vague vision talk.
          ============================================================ */}
      <section id="audience" className="si-section" aria-labelledby="bk-audience-heading">
        <GlyphTitle id="bk-audience-heading">What your community gets</GlyphTitle>

        <div className="bk-what__row">
          <div className="bk-what__half">
            <ul className="bk-checklist bk-checklist--alt">
              <li><strong>Freeform listening.</strong> Chad has a magnetic presence, but attendees should feel comfortable to stand up, sit down, watch, close their eyes, whatever &mdash; let the songs do the work.</li>
              <li><strong>A room full of their own kind.</strong> People from every walk of life who also do not quite fit anywhere.</li>
              <li><strong>Songs that raise frequency.</strong> New, original songs that make pop music safe and uplifting for conscious beings.</li>
              <li><strong>Kindred discourse.</strong> An opportunity to discuss topics surrounding media and entertainment that they may not be able to discuss anywhere else in their life.</li>
              <li><strong>A lens for what they listen to after.</strong> Empowered with the Rising Compass to use and explore however they may be compelled to.</li>
            </ul>
          </div>
          <div className="bk-what__art">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/flight-ready.webp"
              alt="Flight Ready -- digital art by Chad Lewine"
              width={1920}
              height={969}
            />
          </div>
        </div>
      </section>

      {/* ============================================================
          SECTION: WHAT THE VENUE GETS   >> REWRITE IN YOUR VOICE <<
          JOB: De-risk the yes. Answer the host's real, practical worries.
          WRITE: 4-6 concrete benefits in a host's own language --
          calendar fit, no production burden, a different kind of night for
          their existing community, they co-curate, a repeatable Volume that
          brings people back. Speak to the room owner, not the listener.
          TONE: practical, generous, confident.  AVOID: vague vision talk.
          ============================================================ */}
      <section id="venue" className="si-door" aria-labelledby="bk-venue-heading">
        <GlyphTitle id="bk-venue-heading">What the venue gets</GlyphTitle>

        <div className="bk-what__row">
          <div className="bk-what__art bk-what__art--natural">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/clarity-modified.webp"
              alt="Clarity -- digital art by Chad Lewine"
              width={1649}
              height={813}
            />
          </div>
          <div className="bk-what__half">
            <ul className="bk-checklist">
              <li><strong>A night that fits the calendar you already run.</strong> If you book sound baths and ecstatic dance, you already know how to host this.</li>
                  <li><strong>A different kind of night for your existing community.</strong> The same people who come for tone and breath get a live, song-based performance they cannot get anywhere else.</li>
              <li><strong>You co-curate the night.</strong> Once you have explored the songs, suggest the set yourself.</li>
              <li><strong>A named, repeatable event that compounds.</strong> Each night is its own &ldquo;Volume&rdquo; &mdash; documented, sharable, and built to bring people back for the next one.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ============================================================
          SECTION: EXPLORE THE SONGS FIRST   >> REWRITE IN YOUR VOICE <<
          JOB: THE pivot of the page. Convince the host to LISTEN before
          booking -- they will not know these songs, and picking off
          titles or cover art is meaningless.
          WRITE: why this is not a covers night, why they should not book
          blind, and that the songs ARE the decision. Point them into the
          full catalog (summaries + audio per track). Keep the coverflow
          taste and both CTAs (catalog + start inquiry).
          TONE: direct, a little provocative ("you will not know these
          yet -- good").  AVOID: burying the listen-first ask.
          ============================================================ */}
      <section id="explore" className="si-door si-door--rc" aria-labelledby="bk-explore-heading">
        <GlyphTitle id="bk-explore-heading">Browse the song catalog</GlyphTitle>

        <SongVoiceGrid songs={voiceSongs} />

        {exploreSongs.length > 0 && (
          <div style={{ marginTop: "calc(var(--space-xl) / 2)", marginBottom: "var(--space-lg)" }}>
            <ExploreSongs songs={exploreSongs} showHeading={false} />
          </div>
        )}
      </section>

      {/* ============================================================
          SECTION: MUSIC VIDEO -- the featured Johnny Boy video, shown on
          the same stage component as the /music-videos page.
          ============================================================ */}
      {featuredVideo && (
        <section id="watch" className="si-door si-door--rc" aria-labelledby="bk-watch-heading">
          <GlyphTitle id="bk-watch-heading">Watch a music video</GlyphTitle>
          <div className="bk-video">
            <PantheonStage video={featuredVideo} showDate={false} />
          </div>
          {featuredQuote && (
            <blockquote className="bk-video__quote">
              <p>{featuredQuote}</p>
              <cite>&mdash; Chad Lewine</cite>
            </blockquote>
          )}
          <div className="si-door__footer">
            <Link href="/music-videos" className="explore-songs__cta">See all music videos &rarr;</Link>
          </div>
        </section>
      )}


      {/* ============================================================
          SECTION: START A BOOKING (overview close)
          >> REWRITE IN YOUR VOICE <<
          JOB: Move the convinced host from "I get it" into the inquiry.
          WRITE: short and warm -- once the songs have spoken to them and
          a few feel like their room, start the inquiry; that is where the
          logistics and the set live. (This CTA triggers the pillar wipe
          into the inquiry state -- keep it as the primary action.)
          TONE: direct, human.  AVOID: re-pitching; they are sold.
          ============================================================ */}
      <section id="start" className="si-door si-door--lead bk-start--cover" aria-labelledby="bk-start-heading">
        <GlyphTitle id="bk-start-heading">Ready to host a night?</GlyphTitle>

        <div className="bk-cta">
          <WipeLink href={INQUIRY_HREF} className="bk-cta__btn">Start a booking inquiry</WipeLink>
        </div>
      </section>
    </>
  );
}

// =======================================================================
// STATE B -- the booking inquiry (URL carries ?booking). Logistics plus the
// setlist picker. Assumes the host has already explored the songs; keeps a
// reminder + link back to the catalog for anyone who lands here cold.
// =======================================================================
function InquiryView({ setlistSongs }: { setlistSongs: SetlistSong[] }) {
  // The whole inquiry view is now one Typeform-style form. It only needs each
  // song's id + title for the search-driven setlist step.
  const songs = setlistSongs.map((s) => ({ id: s.id, title: s.title }));
  return <BookingInquiryForm songs={songs} />;
}

export default async function BookingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const isInquiry = sp.booking !== undefined;
  const [{ setlistSongs, exploreSongs }, { video: featuredVideo, quote: featuredQuote }, voiceSongs] =
    await Promise.all([fetchCatalog(), fetchFeaturedVideo(), fetchVoiceSongs()]);

  return (
    <div
      id="page-booking"
      className={`page-songwriting page-booking${isInquiry ? " page-booking--inquiry" : ""}`}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(BOOKING_JSON_LD) }}
      />
      <BookingWipeTransition />
      {isInquiry ? (
        <InquiryView setlistSongs={setlistSongs} />
      ) : (
        <OverviewView exploreSongs={exploreSongs} featuredVideo={featuredVideo} featuredQuote={featuredQuote} voiceSongs={voiceSongs} />
      )}
    </div>
  );
}
