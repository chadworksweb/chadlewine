import type { Metadata } from "next";
import { mergeMetadata } from "@/lib/page-meta";
import { SectionMessagePlayer } from "@/components/SectionMessagePlayer";
import { SongVoiceGrid, type VoiceSong } from "@/components/SongVoiceGrid";
import { PartnershipTooltip } from "@/components/PartnershipTooltip";
import { InquireForm } from "@/components/InquireForm";
import { ProcessSteps } from "@/components/ProcessSteps";
import { createPublicClient } from "@/lib/supabase-server";
import { fetchBadge } from "@/lib/rising-compass";

export const dynamic = "force-dynamic";

const DEFAULT_METADATA: Metadata = {
  title: "Songwriting - Sing My Songs or Complete Your Vision",
  description:
    "Chad Lewine writes more songs than he can record and wants them sung. Sing one of his finished songs, or have him co-write and complete your own vision into a song. Positive, message-driven, genre-irrelevant.",
  alternates: { canonical: "https://chadlewine.com/songwriting" },
  openGraph: {
    title: "Songwriting - Chad Lewine",
    description:
      "Sing a finished song of mine, or let me help complete your vision into a song. Message-driven, positive, genre-irrelevant.",
    url: "https://chadlewine.com/songwriting",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  return mergeMetadata("/songwriting", DEFAULT_METADATA);
}

// FAQ doubles as the GEO citation block. Questions below are suggested starting
// points - edit freely. Write each answer in your voice; keep the first
// sentence a clean, quotable, attributable claim.
const FAQ = [
  { q: "Can I release original music if I do not write songs?", a: "[[ANSWER: ...]]" },
  { q: "What is the difference between Sing My Songs and Cowriting and Vision Completion?", a: "[[ANSWER: ...]]" },
  { q: "Do you keep the rights to a song I record?", a: "[[ANSWER: 50/50 initial bid; majors case by case; no fee either way for pre-income artists]]" },
  { q: "Is this songwriting lessons or coaching?", a: "[[ANSWER: no - co-creation, not instruction; for singers who already know how to sing]]" },
  { q: "What kind of songs do you write?", a: "[[ANSWER: decent to ascended on the Rising Compass; never corrupted or degraded]]" },
];

// Only emit FAQ schema once real answers exist (avoid publishing placeholders).
const realFaq = FAQ.filter((f) => !f.a.startsWith("[["));

const SONGWRITING_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Service",
  name: "Songwriting with Chad Lewine",
  serviceType: "Songwriting partnership",
  url: "https://chadlewine.com/songwriting",
  provider: {
    "@type": "Person",
    "@id": "https://chadlewine.com/chad-lewine#person",
    name: "Chad Lewine",
  },
  description:
    "Chad Lewine offers original, message-driven songs for other artists to sing, and co-writes with singers to complete their own vision into a finished song.",
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Songwriting offers",
    itemListElement: [
      {
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: "Sing My Songs",
          description: "Finished, original songs for other artists to record in their own voice.",
        },
      },
      {
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: "Cowriting and Vision Completion",
          description: "A hands-on co-write that helps a singer turn their own vision into a finished song.",
        },
      },
    ],
  },
};

const FAQ_JSON_LD =
  realFaq.length > 0
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: realFaq.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      }
    : null;

// A spoken note from Chad per section. Drop in `audioUrl` (and ideally
// `durationSeconds`) when each message is recorded - the player goes live
// automatically and shows a "coming soon" placeholder until then.
const SECTION_MESSAGES = {
  cut: { label: "A brief note on my vision", audioUrl: "/audio-notes/songwriting-note-intro.m4a", durationSeconds: 49 },
  sing: { label: "On writing songs for other artists", audioUrl: "/audio-notes/songwriting-note-sing.m4a", durationSeconds: 50 },
  vision: { label: "On cowriting and finessing your vision", audioUrl: "/audio-notes/songwriting-note-cowriting.m4a", durationSeconds: 49 },
};

// The grid pulls a curated set from the `songs` table, chosen and ordered via
// /admin/songwriting (the `available_for_a_voice` flag + `voice_display_order`).
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

// Visible fill-in prompt. Remove each one as you replace it with real copy.
function Prompt({ children }: { children: React.ReactNode }) {
  return (
    <p className="sw-prompt">
      <strong>WRITE:</strong> {children}
    </p>
  );
}

export default async function SongwritingPage() {
  const voiceSongs = await fetchVoiceSongs();
  return (
    <div id="page-songwriting" className="page-songwriting">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SONGWRITING_JSON_LD) }}
      />
      {FAQ_JSON_LD && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
        />
      )}

      {/* Section 1 - Hero */}
      <section className="si-hero" aria-label="Songwriting">
        <div className="si-hero__inner">
          <h1 className="si-hero__eyebrow">
            Writing songs for a higher purpose.
          </h1>
          <h2 className="si-hero__headline">Songwriting</h2>
          <div className="si-hero__sub">
            <Prompt>
              Hero sub copy - not yet written. 2-3 sentences introducing the two offers.
            </Prompt>
          </div>
          <div className="si-hero__nav">
            <a href="#cut" className="si-hero__nav-link">The Inspirational Song Guy</a>
            <a href="#sing" className="si-hero__nav-link">Sing My Songs</a>
            <a href="#vision" className="si-hero__nav-link">Cowriting &amp; Vision</a>
            <a href="#how" className="si-hero__nav-link">How It Works</a>
            <a href="#who" className="si-hero__nav-link">Who This Is For</a>
          </div>
        </div>
      </section>

      {/* Lead - The Inspirational Cut (pitch to the music industry) */}
      <section id="cut" className="si-door si-door--lead" aria-labelledby="sw-cut-heading">
        <p className="si-door__eyebrow">For the major music industry</p>
        <div className="si-banner-bar">
          <div className="glyph-title-bar glyph-title-bar--top">
            <span className="glyph-title-bar__label" aria-hidden="true">&#9617;&#9618;&#9619;&#9608;</span>
            <h2 className="glyph-title-bar__heading" id="sw-cut-heading">The Inspirational Cut</h2>
            <span className="glyph-title-bar__label" aria-hidden="true">&#9608;&#9619;&#9618;&#9617;</span>
          </div>
        </div>

        <SectionMessagePlayer {...SECTION_MESSAGES.cut} />

        <div className="si-prose" style={{ marginBottom: "var(--space-xl)" }}>
          <p>
            It&rsquo;s cooler than ever to be bad. The irreverent counterculture of the 90s and 2000s
            is now a mainstream staple. It&rsquo;s commonplace to be disrespectful, degenerate,
            nihilistic and anxious; everyone&rsquo;s doing it. And when everyone starts doing it, it
            starts to get old. Soon, being bad will start feeling bad instead of feeling trendy. Soon,
            it&rsquo;s going to be cool to care, as I mention in my song{" "}
            <a href="/music/songs/this-is-a-raid">This is a Raid!</a>
          </p>
          <p>
            I&rsquo;m Chad Lewine, and on this webpage I&rsquo;ve decided to call myself The
            Inspirational Song Guy. We&rsquo;ll see if it sticks.
          </p>
          <p>
            I&rsquo;ve been writing pop songs embedded with inspirational and deeply thoughtful
            messages for nearly two decades. I&rsquo;m not talking Fight Song by Rachel Platten,
            I&rsquo;m talking Man In The Mirror by Michael Jackson. I&rsquo;m not talking Firework by
            Katy Perry, I&rsquo;m talking The Living Years by Mike and the Mechanics. I&rsquo;m talking
            Conviction of the Heart by Kenny Loggins and Mmmbop by Hanson (that song is deep, if you
            didn&rsquo;t know.) I write songs that blend in with the sonics and arrangement of
            contemporary music but carry a message markedly different from what&rsquo;s trendy or
            charting.
          </p>
          <p>
            If you or your artist wants a song that no one else has, I&rsquo;ve got it. A song that
            blends the coolness of the 90s with the heart of the 70s, dressed with modern day
            phrasing. A song that not only is catchy but coherent. A song based on{" "}
            <em>in</em>-tention, not <em>a</em>-ttention.
          </p>
          <p>
            Take a look at some of my selections below. I can work with artists and labels in a
            variety of capacities. <a href="#inquire">Click here to inquire.</a>
          </p>
        </div>

        <SongVoiceGrid songs={voiceSongs} />

        <div className="si-door__footer">
          <a href="#inquire" className="explore-songs__cta">
            Start a conversation &rarr;
          </a>
        </div>
      </section>

      {/* Offer 1 - Sing My Songs */}
      <section id="sing" className="si-door si-door--sing" aria-labelledby="sw-sing-heading">
        <p className="si-door__eyebrow">I deliver finished songs</p>
        <div className="si-banner-bar">
          <div className="glyph-title-bar glyph-title-bar--top">
            <span className="glyph-title-bar__label" aria-hidden="true">&#9617;&#9618;&#9619;&#9608;</span>
            <h2 className="glyph-title-bar__heading" id="sw-sing-heading">Sing My Songs</h2>
            <span className="glyph-title-bar__label" aria-hidden="true">&#9608;&#9619;&#9618;&#9617;</span>
          </div>
        </div>

        <SectionMessagePlayer {...SECTION_MESSAGES.sing} />

        <div className="si-prose" style={{ marginBottom: "var(--space-xl)" }}>
          <p>
            I write more songs than I&rsquo;ll ever be able to record under my own name, but these
            songs need a home because they are valuable. They are more than cookie-cutter pop bops.
            They are not disposable or trendy &mdash; they are timeless (some timely), deep and
            intentional. Because of this endless well of songs, I&rsquo;m looking to{" "}
            <PartnershipTooltip
              label={
                <>
                  <strong>Partnership.</strong> No fee charged by me and no fee paid to you for
                  artists not yet generating a living from their music. 50/50 split as the initial
                  bid. Major-label or major-indie-label artists are negotiated case by case.
                </>
              }
            >
              partner
            </PartnershipTooltip>{" "}
            with singers that want to cut my songs.
          </p>
          <p>
            I know that there are singers out there that are tired of singing the modern-day American
            songbook (post-90s topics: sex/love/relationships, materialism, party, dance) and want to
            sing unique songs; songs like mine. That&rsquo;s why I created this page: to create
            awareness of my interest in having my songs sung by as many voices as possible, and to
            help voices become clearer, more intentional, and more positive in the messages they
            sing.
          </p>
          <p>
            Please note that while I don&rsquo;t produce finished records, I do produce demos and can
            help source the right production &mdash; whether that&rsquo;s a simple $20 leased beat and a home-studio setup, or hiring a
            Grammy-winning producer in a state-of-the-art studio.
          </p>
        </div>

        <div className="si-door__footer">
          <a href="#inquire" className="explore-songs__cta">
            Start a conversation &rarr;
          </a>
        </div>

      </section>

      {/* Offer 2 - Cowriting and Vision Completion */}
      <section id="vision" className="si-door si-door--write" aria-labelledby="sw-vision-heading">
        <p className="si-door__eyebrow">I help you complete your vision</p>
        <div className="si-banner-bar">
          <div className="glyph-title-bar glyph-title-bar--top">
            <span className="glyph-title-bar__label" aria-hidden="true">&#9617;&#9618;&#9619;&#9608;</span>
            <h2 className="glyph-title-bar__heading" id="sw-vision-heading">Cowriting and Vision Completion</h2>
            <span className="glyph-title-bar__label" aria-hidden="true">&#9608;&#9619;&#9618;&#9617;</span>
          </div>
        </div>

        <SectionMessagePlayer {...SECTION_MESSAGES.vision} />

        <div className="si-prose" style={{ marginBottom: "var(--space-xl)" }}>
          <p>
            Before I even considered having other artists sing my songs, I always carried the
            intention of helping to empower visionary artists with the skills to actually fully
            manifest that vision into song form. While my purpose for having other artists sing my
            songs is not capital-driven, my stance on the industry splitting up the singer and the
            songwriter would be hypocritical if I only wanted others to sing my songs.
          </p>
          <p>
            So, in addition to offering my finished songs to singers and artists as a complete
            creative work, I also offer a hands-on service where I&rsquo;ll help you (in an official
            co-write capacity) craft the vision in your head into the song it&rsquo;s meant to be.
            This is not a coaching or a training program. Once you decide you want my help,
            I&rsquo;ll jump right in, surveying you for what you want deep down and immediately
            applying that to your song(s).
          </p>
          <p>
            This includes lyric, melody, and vocal delivery. This does not include vocal technique or
            learning to sing. This is for singers that know how to sing, because again, I&rsquo;m not
            a teacher &mdash; I&rsquo;m a partner that&rsquo;s helping you write a song. A good song
            can only go so far if the delivery isn&rsquo;t there; good lyrics can only go so far if
            the melody isn&rsquo;t there.
          </p>
          <p>
            It&rsquo;s important to know that my songwriting is based on a strict moral code. I
            don&rsquo;t write, or help write, songs about materialism, baseline relationship topics,
            self-focused narratives, or anything that may resemble what&rsquo;s trending on social
            media or topping the pop charts. In this case it&rsquo;s not a rejection of the
            institution itself, but a rejection of the content of what is trending and what is on the
            charts.
          </p>
          <p>
            My goal is to make the content of what is trending and what is on the charts more
            positive. If you want to learn more about what I consider positive, check out{" "}
            <a href="https://risingcompass.net" target="_blank" rel="noopener noreferrer">
              The Rising Compass
            </a>
            . My goal is to only write songs from decent to ascended. I won&rsquo;t write songs that
            are corrupted or degraded.
          </p>
        </div>

        <div className="si-door__footer">
          <a href="#inquire" className="explore-songs__cta">
            Start a conversation &rarr;
          </a>
        </div>
      </section>

      {/* Section - Here's how it works (the real-time songwriting process) */}
      <section className="si-section" id="how" aria-labelledby="sw-how-heading">
        <div className="si-banner-bar">
          <div className="glyph-title-bar glyph-title-bar--top">
            <span className="glyph-title-bar__label" aria-hidden="true">&#9617;&#9618;&#9619;&#9608;</span>
            <h2 className="glyph-title-bar__heading" id="sw-how-heading">Here&rsquo;s how it works</h2>
            <span className="glyph-title-bar__label" aria-hidden="true">&#9608;&#9619;&#9618;&#9617;</span>
          </div>
        </div>

        <h3 className="sw-how__subhead">
          Writing a song for you in real time
          <span className="sw-how__subhead-note"> (the human version of Suno)</span>
        </h3>

        <ProcessSteps />

        <div className="si-prose">
          <p>
            The arrangement and its sections will reveal themselves as we go. I don&rsquo;t go into
            sessions with anything planned. As they say, leave space for god in the room. I say, god{" "}
            <em>is</em> the room. (God meaning the nondenominational force that is the stream of
            consciousness creative state.)
          </p>
          <p>
            We then continue to mold, sculpt, finesse and iterate on the song, with me leading the
            process until the full sketch is complete.
          </p>
          <p>
            A sketch consists of, at the minimum, an acapella track with a single vocal track (tuned
            or raw, your preference) that demonstrates the topline composition (melody and lyrics) and
            the lyrics themselves. Sketches often are much more than that sonically, but you will walk
            away with something complete in about an hour that you can then take to a producer or
            re-record and iterate on yourself.
          </p>
          <p>
            It is important to know that for this to work, I need to lead the way until we have a
            complete product. We&rsquo;ll know early on if what I do will work for what you want or
            not. I&rsquo;m here to provide my signature style and process, not to be directed. That
            doesn&rsquo;t mean your ideas aren&rsquo;t welcome &mdash; in fact, your idea is how it all
            begins &mdash; but I need to be able to pull the idea or vision out of you into a complete
            composition in order for my service to be rendered to the highest standard possible, and
            that requires me being in the driver&rsquo;s seat.
          </p>
        </div>

        <h3 className="sw-how__subhead sw-how__subhead--addon">Add-on: simple demo production</h3>
        <div className="si-prose">
          <p>
            I&rsquo;m able to add basic rhythm and electronic or synthesized tracks to your sketch for
            an additional fee. This could be in real time or on my own time. I don&rsquo;t claim to
            &ldquo;be a producer,&rdquo; but I&rsquo;ve produced over 75% of the songs you hear on my
            website, so I&rsquo;m confident I can give your sketch the bones it needs to become a
            proper demo.
          </p>
        </div>

        <div className="si-door__footer">
          <a href="#inquire" className="explore-songs__cta">
            Inquire about Realtime Human Songwriting &rarr;
          </a>
        </div>
      </section>

      {/* Section - Who this is for */}
      <section className="si-section" id="who" aria-labelledby="sw-who-heading">
        <div className="si-banner-bar">
          <div className="glyph-title-bar glyph-title-bar--top">
            <span className="glyph-title-bar__label" aria-hidden="true">&#9617;&#9618;&#9619;&#9608;</span>
            <h2 className="glyph-title-bar__heading" id="sw-who-heading">Who This Is For</h2>
            <span className="glyph-title-bar__label" aria-hidden="true">&#9608;&#9619;&#9618;&#9617;</span>
          </div>
        </div>
        <div className="si-prose">
          <p>
            Working with my songs is for artists that know music is powerful and can be used for more
            than entertainment; more than sync for soundtracks and commercials, and more than
            background noise for TikTok videos. It&rsquo;s for artists that know their voice and
            vision is meant for more than Spotify&rsquo;s functional sleep, study, and workout
            playlists; more than social media&rsquo;s bite-sized dopamine casino. Working with my
            songs &mdash; either singing songs I&rsquo;ve written or having me help you write your own
            &mdash; is for artists that want to unlock the ancient and latent metaphysical power
            behind music. Genre is irrelevant. Working with me, or my songs, is for artists that know
            music can change the world.
          </p>
          <p className="sw-audiences__lead">It comes down to three kinds of artist:</p>
          <ul className="sw-audiences">
            <li>
              <strong>Established &amp; signed artists</strong> &mdash; [[WRITE: one line - you want
              the genuinely positive, inspirational cut for your next record]]
            </li>
            <li>
              <strong>Singers who don&rsquo;t write</strong> &mdash; [[WRITE: one line - you have the
              voice and want a real song worth carrying]]
            </li>
            <li>
              <strong>Visionary artists who write</strong> &mdash; [[WRITE: one line - you have the
              vision and want a co-writer to complete it]]
            </li>
          </ul>
          <p>
            <a href="#inquire" className="explore-songs__cta">
              Inquire &rarr;
            </a>
          </p>
        </div>
      </section>

      {/* Section - Inquire (contact form; email address intentionally not shown) */}
      <section id="inquire" className="si-section" aria-labelledby="sw-inquire-heading">
        <div className="si-banner-bar">
          <div className="glyph-title-bar glyph-title-bar--top">
            <span className="glyph-title-bar__label" aria-hidden="true">&#9617;&#9618;&#9619;&#9608;</span>
            <h2 className="glyph-title-bar__heading" id="sw-inquire-heading">Inquire</h2>
            <span className="glyph-title-bar__label" aria-hidden="true">&#9608;&#9619;&#9618;&#9617;</span>
          </div>
        </div>
        <div className="sw-inquire">
          <div className="sw-inquire__left">
            <p className="sw-inquire__intro">
              Tell me who you are and let me hear you. Send a recording, a video, or anything that
              carries your voice &mdash; at least one file is required. I read every inquiry myself.
            </p>
            <InquireForm />
          </div>
          <div className="sw-inquire__image" aria-hidden="true" />
        </div>
      </section>

      {/* Section - FAQ (doubles as the GEO citation block). Answers not yet written. */}
      <section className="si-section" id="faq" aria-labelledby="sw-faq-heading">
        <div className="si-banner-bar">
          <div className="glyph-title-bar glyph-title-bar--top">
            <span className="glyph-title-bar__label" aria-hidden="true">&#9617;&#9618;&#9619;&#9608;</span>
            <h2 className="glyph-title-bar__heading" id="sw-faq-heading">Questions</h2>
            <span className="glyph-title-bar__label" aria-hidden="true">&#9608;&#9619;&#9618;&#9617;</span>
          </div>
        </div>
        <div className="si-prose">
          {FAQ.map((item) => (
            <div key={item.q} style={{ marginBottom: "var(--space-lg)" }}>
              <h3>{item.q}</h3>
              <Prompt>{item.a}</Prompt>
            </div>
          ))}
        </div>
      </section>

      {/* The full backstory lives in an Observation, linked quietly at the foot. */}
      <section className="si-section sw-backstory">
        <p>
          <a href="https://chadlewine.com/observations/on-writing-songs-for-other-artists">
            The thinking behind this &rarr;
          </a>
        </p>
      </section>
    </div>
  );
}
