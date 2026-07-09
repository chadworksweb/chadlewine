import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Glad you're staying - Chad Lewine",
  robots: { index: false, follow: false },
};

// Landing for the win-back campaign button. Token-free on purpose: the click
// itself (on the tracked link) is what flips the recipient's engagement via the
// Resend webhook, so this page only needs to confirm it warmly. Reuses the
// unsubscribe/confirm centered card shell (its sibling micro-page pattern), so
// no new CSS. Noindexed so it never shows up in search.
export default function StillHerePage() {
  return (
    <div className="page-static unsubscribe-page">
      <div className="unsubscribe-page__inner">
        <h1 className="unsubscribe-page__title">Thank you for staying.</h1>
        <p className="unsubscribe-page__body">
          You remain on the list. Glad you&rsquo;re still here.
        </p>
        <p className="unsubscribe-page__body">Chad</p>

        <p className="unsubscribe-page__actions">
          <Link href="/" className="unsubscribe-page__home">
            Back to chadlewine.com &rarr;
          </Link>
        </p>
      </div>
    </div>
  );
}
