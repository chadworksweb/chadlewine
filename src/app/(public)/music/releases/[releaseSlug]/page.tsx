import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { createPublicClient, getPlaybackMode } from "@/lib/supabase-server";
import { ReleaseDetail } from "@/components/ReleaseDetail";
import { ReleaseSections } from "@/components/ReleaseSections";
import { AlbumChargeJsonLd } from "@/components/AlbumChargeJsonLd";
import { YouMightAlsoLike } from "@/components/YouMightAlsoLike";
import { AdminEditButton } from "@/components/AdminEditButton";
import { fetchBadge, fetchAlbumBadge, rcBadgeHref, type RisingCompassBadgeData } from "@/lib/rising-compass";
import { releaseTypeLabel, releaseFormatLabel } from "@/lib/release-labels";
import { fetchReleaseSkusForIds, fetchSongSkusForIds } from "@/lib/release-skus";

export const revalidate = 60;

async function getAlbumData(releaseSlug: string) {
  const supabase = createPublicClient();

  const { data: album } = await supabase
    .from("releases")
    .select("*")
    .eq("slug", releaseSlug)
    .in("status", ["unreleased", "published"])
    .single();
  if (!album) return null;

  // Get songs via junction
  const { data: junctions } = await supabase
    .from("release_songs")
    .select("track_number, song:songs(id, title, slug, duration_seconds, streaming_path, status, song_summary, ringtone_path_m4r, ringtone_path_mp3, ringtone_price, playback_mode)")
    .eq("release_id", album.id)
    .order("track_number");

  type SongPayload = {
    id: string;
    title: string;
    slug: string;
    duration_seconds: number | null;
    streaming_path: string | null;
    status: string;
    song_summary: string | null;
    ringtone_path_m4r: string | null;
    ringtone_path_mp3: string | null;
    ringtone_price: number | null;
    playback_mode: string | null;
  };
  type ReleaseSongRow = { track_number: number; song: SongPayload };

  const filtered = ((junctions || []) as unknown as ReleaseSongRow[]).filter(
    (j) => j.song?.status === "published" || j.song?.status === "unreleased",
  );

  // Singles are not public releases. A single-type release is an internal
  // "this song ships standalone" declaration; the song lives on its own page
  // (songs-are-atomic), where the canonical song_sku is sold. The release URL
  // is a non-public artifact, so redirect it to the song page -- this makes it
  // unreachable to humans and consolidates crawl/index signals onto the song.
  // Covers every current single and any future single-type release.
  if ((album as { release_type?: string | null }).release_type === "single") {
    const songSlug = filtered[0]?.song.slug ?? null;
    return { redirectTo: songSlug ? `/music/songs/${songSlug}` : null } as const;
  }

  // Release SKUs for the format picker.
  const skusByRelease = await fetchReleaseSkusForIds(supabase, [album.id]);
  const releaseSkus = skusByRelease.get(album.id) || [];

  // Per-track digital song SKU drives the inline track buy button.
  const songSkusByTrack = await fetchSongSkusForIds(
    supabase,
    filtered.map((j) => j.song.id),
  );

  const playbackModes = await Promise.all(
    filtered.map((j) => getPlaybackMode(j.song.playback_mode ?? null)),
  );

  const songs = filtered.map((j, i) => {
    const digitalSku = (songSkusByTrack.get(j.song.id) || []).find(
      (s) => s.format === "digital" && (s.status === "available" || s.status === "preorder"),
    );
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
      sku_id: digitalSku?.id ?? null,
      price: digitalSku?.price ?? null,
      song_summary: j.song.song_summary,
      playback_mode: playbackModes[i],
      ringtone_available: ringtoneAvailable,
      ringtone_price: ringtoneAvailable ? j.song.ringtone_price : null,
    };
  });

  return { album, songs, releaseSkus };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ releaseSlug: string }>;
}): Promise<Metadata> {
  const { releaseSlug } = await params;
  const result = await getAlbumData(releaseSlug);
  if (!result) return {};
  // Singles redirect to the song page; never index the release URL.
  if ("redirectTo" in result) return { robots: { index: false, follow: false } };

  const { album } = result;
  // citation_summary is the AI-tuned canonical answer; fall back to concept,
  // then to a generic line. All capped at 280 for OG/twitter.
  const meta = (album.citation_summary || album.concept_statement || `${album.title} by Chad Lewine.`).slice(0, 280);
  return {
    title: `${album.title} — Chad Lewine`,
    description: meta,
    alternates: {
      canonical: `https://chadlewine.com/music/releases/${releaseSlug}`,
    },
  };
}

export default async function AlbumDetailPage({
  params,
}: {
  params: Promise<{ releaseSlug: string }>;
}) {
  const { releaseSlug } = await params;
  const result = await getAlbumData(releaseSlug);
  if (!result) notFound();
  // Singles have no public release page -- send them to their song page.
  if ("redirectTo" in result) {
    if (result.redirectTo) permanentRedirect(result.redirectTo);
    notFound();
  }

  const { album, songs, releaseSkus } = result;

  // Header chip: "Multiple formats" when more than one SKU format sellable,
  // else the single format name. Combined with the release type ("Album").
  const skuFormats = Array.from(
    new Set(releaseSkus.map((s) => releaseFormatLabel(s.format)).filter(Boolean)),
  );
  const skuLabel =
    skuFormats.length === 0
      ? null
      : skuFormats.length === 1
        ? skuFormats[0]
        : "Multiple formats";
  const typeLabel = releaseTypeLabel((album as Record<string, unknown>).release_type as string | null);
  const headerFormatLabel = [skuLabel, typeLabel].filter(Boolean).join(" ") || null;

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
      <AdminEditButton href={`/admin/music/releases/${album.slug || album.id}`} />
      <AlbumChargeJsonLd
        albumTitle={album.title}
        albumSlug={album.slug}
        releaseDate={album.release_date}
        imagePath={album.cover_art_path}
        releaseType={(album as { release_type?: string | null }).release_type ?? null}
        tracks={songs.map((s) => ({ title: s.title, slug: s.slug }))}
        badge={albumBadgeData}
        citationSummary={album.citation_summary || null}
      />
      <ReleaseDetail
        album={{
          id: album.id,
          title: album.title,
          slug: album.slug,
          cover_art_path: album.cover_art_path,
          cover_art_alt: album.cover_art_alt,
          release_date: album.release_date,
          concept_statement: album.concept_statement || null,
          format_label: headerFormatLabel,
        }}
        songs={songs.map((s) => ({
          id: s.id,
          title: s.title,
          slug: s.slug,
          track_number: s.track_number,
          duration_seconds: s.duration_seconds,
          streaming_path: s.streaming_path,
          sku_id: s.sku_id,
          price: s.price,
          song_summary: s.song_summary,
          playback_mode: s.playback_mode,
          ringtone_available: s.ringtone_available,
          ringtone_price: s.ringtone_price,
        }))}
        badge={albumBadge}
        skus={releaseSkus.map((s) => ({
          id: s.id,
          format: s.format,
          price: s.price,
          status: s.status === "discontinued" ? "available" : s.status,
          stock: s.stock,
          gallery_images: s.gallery_images,
          variants: s.variants,
        }))}
      />
      <ReleaseSections
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
      <YouMightAlsoLike sourceType="release" sourceId={album.id} />
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
