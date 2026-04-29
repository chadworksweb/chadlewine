import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createPublicClient, getPlaybackMode } from "@/lib/supabase-server";
import { AlbumDetail } from "@/components/AlbumDetail";
import { AlbumSections } from "@/components/AlbumSections";
import { AdminEditButton } from "@/components/AdminEditButton";
import { fetchBadge, fetchAlbumBadge, rcBadgeHref, type RisingCompassBadgeData } from "@/lib/rising-compass";

export const revalidate = 60;

async function getAlbumData(albumSlug: string) {
  const supabase = createPublicClient();

  const { data: album } = await supabase
    .from("albums")
    .select("*, release_formats(label)")
    .eq("slug", albumSlug)
    .in("status", ["unreleased", "published"])
    .single();
  if (!album) return null;

  // Get songs via junction
  const { data: junctions } = await supabase
    .from("album_songs")
    .select("track_number, song:songs(id, title, slug, duration_seconds, streaming_path, price, status, download_path, download_path_mp3, download_path_flac, download_path_wav, ringtone_path_m4r, ringtone_path_mp3, ringtone_price, playback_mode)")
    .eq("album_id", album.id)
    .order("track_number");

  const filtered = (junctions || []).filter(
    (j: any) => j.song?.status === "published" || j.song?.status === "unreleased",
  );

  const playbackModes = await Promise.all(
    filtered.map((j: any) => getPlaybackMode(j.song.playback_mode ?? null)),
  );

  const songs = filtered.map((j: any, i: number) => {
    const explicit = (["mp3", "flac", "wav"] as const).filter(
      (f) => j.song[`download_path_${f}`],
    );
    const formats: Array<"mp3" | "flac" | "wav"> =
      explicit.length > 0 ? explicit : j.song.download_path ? ["mp3"] : [];
    const ringtoneAvailable =
      !!j.song.ringtone_price &&
      !!(j.song.ringtone_path_m4r || j.song.ringtone_path_mp3);
    return {
      id: j.song.id,
      title: j.song.title,
      slug: j.song.slug,
      track_number: j.track_number,
      duration_seconds: j.song.duration_seconds,
      streaming_path: j.song.streaming_path,
      price: j.song.price,
      playback_mode: playbackModes[i],
      download_formats: formats,
      ringtone_available: ringtoneAvailable,
      ringtone_price: ringtoneAvailable ? j.song.ringtone_price : null,
    };
  });

  const anyLegacyDownload = (junctions || []).some((j: any) => j.song?.download_path);

  return { album, songs, anyLegacyDownload };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ albumSlug: string }>;
}): Promise<Metadata> {
  const { albumSlug } = await params;
  const result = await getAlbumData(albumSlug);
  if (!result) return {};

  const { album } = result;
  // citation_summary is the AI-tuned canonical answer; fall back to concept,
  // then to a generic line. All capped at 280 for OG/twitter.
  const meta = (album.citation_summary || album.concept_statement || `${album.title} by Chad Lewine.`).slice(0, 280);
  return {
    title: `${album.title} — Chad Lewine`,
    description: meta,
    alternates: {
      canonical: `https://chadlewine.com/music/albums/${albumSlug}`,
    },
  };
}

export default async function AlbumDetailPage({
  params,
}: {
  params: Promise<{ albumSlug: string }>;
}) {
  const { albumSlug } = await params;
  const result = await getAlbumData(albumSlug);
  if (!result) notFound();

  const { album, songs, anyLegacyDownload } = result;

  // Fetch album badge from Rising Compass API + per-song badges in parallel
  const [albumBadgeData, ...badgeResults] = await Promise.all([
    fetchAlbumBadge(album.title, "Chad Lewine"),
    ...songs.map((s) => fetchBadge(s.title, "Chad Lewine")),
  ]);

  const songBadges: Record<string, RisingCompassBadgeData> = {};
  songs.forEach((s, i) => {
    if (badgeResults[i]) songBadges[s.id] = badgeResults[i]!;
  });

  const albumBadge = albumBadgeData
    ? {
        tier: albumBadgeData.tier,
        tierLabel: albumBadgeData.tier_label,
        tierHex: albumBadgeData.tier_hex,
        charge: albumBadgeData.charge,
        chargeSummary: albumBadgeData.charge_summary,
        contaminated: albumBadgeData.contaminated,
        contaminationNote: albumBadgeData.contamination_note,
        artistSlug: albumBadgeData.artist_slug ?? null,
      }
    : null;

  return (
    <>
      <AdminEditButton href={`/admin/music/albums/${album.slug || album.id}`} />
      <AlbumDetail
        album={{
          id: album.id,
          title: album.title,
          slug: album.slug,
          cover_art_path: album.cover_art_path,
          cover_art_alt: album.cover_art_alt,
          release_date: album.release_date,
          concept_statement: album.concept_statement || null,
          format_label: (album as any).release_formats?.label || null,
          price: album.price,
        }}
        songs={songs.map((s) => ({
          id: s.id,
          title: s.title,
          slug: s.slug,
          track_number: s.track_number,
          duration_seconds: s.duration_seconds,
          streaming_path: s.streaming_path,
          price: s.price,
          playback_mode: s.playback_mode,
          download_formats: s.download_formats,
          ringtone_available: s.ringtone_available,
          ringtone_price: s.ringtone_price,
        }))}
        badge={albumBadge}
        availableFormats={(() => {
          const explicit = (["mp3", "flac", "wav"] as const).filter((f) => (album as Record<string, unknown>)[`download_path_${f}`]);
          if (explicit.length > 0) return explicit;
          return anyLegacyDownload ? ["mp3" as const] : [];
        })()}
      />
      <AlbumSections
        albumId={album.id}
        album={{
          id: album.id,
          title: album.title,
          slug: album.slug,
          cover_art_path: album.cover_art_path,
          cover_art_alt: album.cover_art_alt,
          release_date: album.release_date,
          concept_statement: album.concept_statement || null,
          citation_summary: album.citation_summary || null,
          entity_tags: Array.isArray(album.entity_tags) ? (album.entity_tags as string[]) : [],
        }}
      />
      {Object.keys(songBadges).length > 0 && (
        <section className="album-rc-classifications" aria-label="Rising Compass Classifications">
          <h3 className="album-rc-classifications__title">Rising Compass Classifications</h3>
          <div className="album-rc-classifications__list">
            {songs.map((s) => {
              const b = songBadges[s.id];
              if (!b) return null;
              return (
                <a
                  key={s.id}
                  href={rcBadgeHref(b)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="album-rc-classifications__row"
                >
                  <span className="album-rc-classifications__track-num">{s.track_number}</span>
                  <span className="album-rc-classifications__track-title">{s.title}</span>
                  <span className="album-rc-classifications__tier">
                    <span
                      className="album-rc-classifications__tier-label"
                      style={{ backgroundColor: b.tier_hex }}
                    >
                      {b.tier_label}
                    </span>
                    <span className="album-rc-classifications__charge">
                      {b.charge > 0 ? "+" : ""}{b.charge}
                    </span>
                  </span>
                </a>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
