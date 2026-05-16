import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "An ode to the fan",
  // Private gift: don't surface in search or social.
  robots: { index: false, follow: false },
};

interface FanSongPageProps {
  searchParams: Promise<{ token?: string }>;
}

interface CurrentSong {
  id: string;
  title: string;
  slug: string;
  art_image_path: string | null;
  art_alt: string | null;
  streaming_path: string | null;
  duration_seconds: number | null;
}

interface AudienceRow {
  id: string;
  first_name: string | null;
  fan_ode_drip_sent_at: string | null;
}

async function getCurrentFanOdeSong(): Promise<CurrentSong | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("songs")
    .select("id, title, slug, art_image_path, art_alt, streaming_path, duration_seconds")
    .eq("is_current_fan_ode", true)
    .maybeSingle();
  return (data as CurrentSong) || null;
}

async function getAudienceByToken(token: string): Promise<AudienceRow | null> {
  if (!token || token.length < 8) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("audience")
    .select("id, first_name, fan_ode_drip_sent_at")
    .eq("fan_ode_token", token)
    .maybeSingle();
  return (data as AudienceRow) || null;
}

export default async function FanSongPage({ searchParams }: FanSongPageProps) {
  const { token } = await searchParams;
  const audience = token ? await getAudienceByToken(token) : null;

  if (!audience) {
    return (
      <main className="fan-song-page fan-song-page--gate">
        <section className="fan-song-page__gate">
          <p className="fan-song-page__eyebrow">An ode to the fan</p>
          <h1 className="fan-song-page__gate-title">This link is private</h1>
          <p className="fan-song-page__gate-body">
            Check your email for the link from chad@chadlewine.com.
            {" "}
            <Link href="/music">Or browse the catalog instead.</Link>
          </p>
        </section>
      </main>
    );
  }

  const song = await getCurrentFanOdeSong();

  if (!song) {
    return (
      <main className="fan-song-page fan-song-page--gate">
        <section className="fan-song-page__gate">
          <p className="fan-song-page__eyebrow">An ode to the fan</p>
          <h1 className="fan-song-page__gate-title">Between gifts</h1>
          <p className="fan-song-page__gate-body">
            The current ode hasn&rsquo;t been swapped in yet. This page will fill
            in when it is.
            {" "}
            <Link href="/music">Browse the catalog</Link> while you wait.
          </p>
        </section>
      </main>
    );
  }

  const greeting = audience.first_name?.trim()
    ? `For ${audience.first_name.trim()}`
    : "For you";

  return (
    <main className="fan-song-page">
      <section className="fan-song-page__hero">
        <p className="fan-song-page__eyebrow">An ode to the fan</p>
        <p className="fan-song-page__greeting">{greeting}</p>
        <h1 className="fan-song-page__title">{song.title}</h1>
      </section>

      {song.art_image_path && (
        <section className="fan-song-page__art-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={song.art_image_path}
            alt={song.art_alt || song.title}
            className="fan-song-page__art"
          />
        </section>
      )}

      {song.streaming_path ? (
        <section className="fan-song-page__player">
          {/* Native HTML5 audio — no controls.list=nodownload because we
              want it downloadable from the player too. */}
          <audio
            controls
            preload="metadata"
            src={song.streaming_path}
            className="fan-song-page__audio"
          >
            Your browser doesn&rsquo;t support audio playback.
          </audio>
        </section>
      ) : (
        <section className="fan-song-page__player fan-song-page__player--coming">
          <p>Audio is being finalized. Come back later today.</p>
        </section>
      )}

      <section className="fan-song-page__note">
        <p>
          Yours. Quietly. No paywall, no ask, no upsell. Just a thank-you for
          buying something real.
        </p>
        <p>
          <Link href="/music">More music &rarr;</Link>
        </p>
      </section>
    </main>
  );
}
