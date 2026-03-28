import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Music — Chad Lewine",
  description: "Music by Chad Lewine — discography, curated selections, and lyrics.",
  alternates: { canonical: "https://chadlewine.com/music" },
};

export default function MusicHubPage() {
  return (
    <div id="page-music-hub" className="page-static">
      <h1 className="page-static__title">Music</h1>

      <div className="music-hub">
        {/* Latest */}
        <section className="music-hub__section">
          <h2 className="music-hub__heading">Latest</h2>
          <p className="music-hub__placeholder">Latest release — wired in next pass</p>
        </section>

        {/* Select */}
        <section className="music-hub__section">
          <h2 className="music-hub__heading">Select</h2>
          <p className="music-hub__placeholder">Curated selection — wired in next pass</p>
        </section>

        {/* Discography */}
        <section className="music-hub__section">
          <h2 className="music-hub__heading">Discography</h2>
          <p className="music-hub__placeholder">Full catalog entry point</p>
          <Link href="/discography" className="music-hub__link">
            Browse Discography →
          </Link>
        </section>
      </div>
    </div>
  );
}
