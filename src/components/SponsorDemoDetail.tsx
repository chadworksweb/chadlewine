import { MiniPlayer } from "@/components/MiniPlayer";
import { SponsorDemoControl } from "@/components/SponsorDemoControl";
import { creditRoleLabel } from "@/lib/song-credits";
import type { PlaybackMode } from "@/components/PlayerContext";
import "./SponsorDemoDetail.css";

interface DemoSong {
  id: string;
  slug: string;
  title: string;
  art_image_path: string | null;
  art_alt: string | null;
  streaming_path: string | null;
  duration_seconds: number | null;
  song_summary: string | null;
  lyrics: string | null;
}

interface SponsorshipPublic {
  production_type: "beat" | "full";
  production_mode: "remote" | "studio" | null;
  goal_cents: number;
  raised_cents: number;
  backer_count: number;
  funded_at: string | null;
  status: string;
  early_access_note: string | null;
}

interface Credit {
  id: string;
  role: string;
  name: string;
}

export function SponsorDemoDetail({
  song,
  sponsorship,
  credits,
  accepting,
  playbackMode,
}: {
  song: DemoSong;
  sponsorship: SponsorshipPublic;
  credits: Credit[];
  accepting: boolean;
  playbackMode: PlaybackMode;
}) {
  return (
    <div className="page-static">
      <article className="sponsor-demo-page">
        <span className="sponsor-demo-page__eyebrow">Demo - open for sponsorship</span>
        <h1 className="sponsor-demo-page__title">{song.title}</h1>

        <div className="sponsor-demo-page__media">
          {song.art_image_path && (
            // eslint-disable-next-line @next/next/no-img-element -- art paths are absolute CDN urls; sizing handled by CSS
            <img
              className="sponsor-demo-page__art"
              src={song.art_image_path}
              alt={song.art_alt || song.title}
              width={320}
              height={320}
            />
          )}

          {song.streaming_path && (
            <MiniPlayer
              songId={song.id}
              songSlug={song.slug}
              streamingUrl={song.streaming_path}
              trackNumber={1}
              trackTitle={song.title}
              durationSeconds={song.duration_seconds ?? 0}
              artImagePath={song.art_image_path}
              artAlt={song.art_alt}
              playbackMode={playbackMode}
              hideTitle
            />
          )}
        </div>

        {song.song_summary && <p className="sponsor-demo-page__summary">{song.song_summary}</p>}

        <SponsorDemoControl
          songId={song.id}
          songSlug={song.slug}
          songTitle={song.title}
          productionType={sponsorship.production_type}
          productionMode={sponsorship.production_mode}
          goalCents={sponsorship.goal_cents}
          raisedCents={sponsorship.raised_cents}
          backerCount={sponsorship.backer_count}
          funded={!!sponsorship.funded_at}
          accepting={accepting}
          earlyAccessNote={sponsorship.early_access_note}
        />

        {song.lyrics && (
          <section className="sponsor-demo-page__lyrics">
            <h2 className="sponsor-demo-page__h2">Lyrics</h2>
            <pre className="sponsor-demo-page__lyrics-body">{song.lyrics}</pre>
          </section>
        )}

        {credits.length > 0 && (
          <section className="sponsor-demo-page__credits">
            <h2 className="sponsor-demo-page__h2">Credits</h2>
            <ul className="sponsor-demo-page__credit-list">
              {credits.map((c) => (
                <li key={c.id}>
                  <span className="sponsor-demo-page__credit-role">{creditRoleLabel(c.role)}</span>
                  {" - "}
                  {c.name}
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </div>
  );
}
