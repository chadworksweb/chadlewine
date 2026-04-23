import Link from "next/link";
import { focalCropStyle } from "@/lib/focal-crop";

type PairedSong = {
  id: string;
  slug: string;
  title: string;
  art_image_path: string | null;
  art_alt: string | null;
  card_focal_x: number | null;
  card_focal_y: number | null;
  card_zoom: number | null;
  song_summary: string | null;
};

type PairedArt = {
  id: string;
  slug: string;
  title: string;
  image_path: string;
  image_alt: string | null;
  card_focal_x: number | null;
  card_focal_y: number | null;
  card_zoom: number | null;
  art_summary: string | null;
};

export function ArtPairingsSections({ pairedSongs, pairedArt }: { pairedSongs: PairedSong[]; pairedArt: PairedArt[] }) {
  return (
    <>
      {pairedSongs.length > 0 && (
        <section className="art-detail__section art-detail__pairings">
          <h2>Songs you might like</h2>
          <div className="art-detail__pairings-grid">
            {pairedSongs.map((s) => (
              <Link key={s.id} href={`/music/songs/${s.slug}`} className="art-pairing-card">
                {s.art_image_path && (
                  <img
                    src={s.art_image_path}
                    alt={s.art_alt || s.title}
                    className="art-pairing-card__img"
                    style={focalCropStyle(s.card_focal_x, s.card_focal_y, s.card_zoom)}
                  />
                )}
                <div className="art-pairing-card__body">
                  <h3 className="art-pairing-card__title">{s.title}</h3>
                  {s.song_summary && <p className="art-pairing-card__summary">{s.song_summary}</p>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {pairedArt.length > 0 && (
        <section className="art-detail__section art-detail__pairings">
          <h2>Other art you might like</h2>
          <div className="art-detail__pairings-grid">
            {pairedArt.map((a) => (
              <Link key={a.id} href={`/art/${a.slug}`} className="art-pairing-card">
                <img
                  src={a.image_path}
                  alt={a.image_alt || a.title}
                  className="art-pairing-card__img"
                  style={focalCropStyle(a.card_focal_x, a.card_focal_y, a.card_zoom)}
                />
                <div className="art-pairing-card__body">
                  <h3 className="art-pairing-card__title">{a.title}</h3>
                  {a.art_summary && <p className="art-pairing-card__summary">{a.art_summary}</p>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

export type { PairedSong, PairedArt };
