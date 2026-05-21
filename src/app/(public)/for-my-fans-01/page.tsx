import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/account";
import { findFanTrackBySlug, findGrantByToken } from "@/lib/fan-tracks";
import { FanTrackPlayer } from "@/components/FanTrackPlayer";

// Single-track gated page for "Aint About Me". Future tracks (-02, -03,
// ...) will each have their own page until we generalize to a [slug]
// route — keeping it explicit for v1 so the URL is meaningful.

const SLUG = "for-my-fans-01";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "For my fans",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

function Gate({ message }: { message: React.ReactNode }) {
  return (
    <div className="for-my-fans-page for-my-fans-page--gate">
      <section className="for-my-fans-page__gate">
        <p className="for-my-fans-page__eyebrow">For my fans</p>
        <h1 className="for-my-fans-page__gate-title">This link is private</h1>
        <p className="for-my-fans-page__gate-body">{message}</p>
      </section>
    </div>
  );
}

export default async function ForMyFans01Page({ searchParams }: PageProps) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <Gate
        message={
          <>
            This URL needs the token I sent you in the email.{" "}
            <Link href="/account">Or open it from your account.</Link>
          </>
        }
      />
    );
  }

  const session = await getCurrentSession();
  if (!session) {
    const next = `/${SLUG}?token=${encodeURIComponent(token)}`;
    redirect(`/account/login?next=${encodeURIComponent(next)}`);
  }

  const track = await findFanTrackBySlug(SLUG);
  if (!track || !track.is_published) {
    return (
      <Gate
        message={
          <>
            This track isn&rsquo;t ready yet. The link will start working
            when it goes live.
          </>
        }
      />
    );
  }

  const grant = await findGrantByToken(track.id, token);
  if (!grant || grant.audience_id !== session.audienceId) {
    return (
      <Gate
        message={
          <>
            This link is meant for a different account.{" "}
            <Link href="/account">Open the version on your dashboard</Link>{" "}
            or email portal@chadlewine.com.
          </>
        }
      />
    );
  }

  return (
    <div className="for-my-fans-page">
      <section className="for-my-fans-page__hero">
        <p className="for-my-fans-page__eyebrow">For my fans</p>
      </section>

      <FanTrackPlayer
        slug={SLUG}
        token={token}
        title={track.title}
        artistCredit={track.artist_credit}
        durationSeconds={track.duration_seconds}
        coverArtPath={track.cover_art_path}
      />

      <section className="for-my-fans-page__note">
        <p>Only fans will hear this song.</p>
        <p>
          <Link href="/music">More music &rarr;</Link>
        </p>
      </section>
    </div>
  );
}
