import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createPublicClient, getPlaybackMode } from "@/lib/supabase-server";
import { SongDetail } from "@/components/SongDetail";
import { SongChargeJsonLd } from "@/components/SongChargeJsonLd";
import { SongMerchSection } from "@/components/SongMerchSection";
import { ExploreStrip } from "@/components/ExploreStrip";
import { AdminEditButton } from "@/components/AdminEditButton";
import { fetchBadge } from "@/lib/rising-compass";
import { renderSection, extractSongSlugs } from "@/lib/visibility-sections";
import { getSingleSongIds } from "@/lib/song-singles";
import { fetchReleaseSkusForIds, fetchSongSkusForIds } from "@/lib/release-skus";

export const revalidate = 60;

type PairedArt = {
  id: string;
  slug: string;
  title: string;
  image_path: string;
  image_alt: string | null;
  hero_focal_x: number | null;
  hero_focal_y: number | null;
  hero_zoom: number | null;
  art_summary: string | null;
};

async function getSongData(songSlug: string) {
  const supabase = createPublicClient();

  const { data: song } = await supabase
    .from("songs")
    .select("*")
    .eq("slug", songSlug)
    .in("status", ["unreleased", "published"])
    .single();
  if (!song) return null;

  // Get album via junction (optional — singles have no album). Filter out
  // the song's own single-type release so we only surface a true album.
  const { data: junctionRows } = await supabase
    .from("release_songs")
    .select("track_number, release:releases(id, title, slug, cover_art_path, cover_art_alt, status, release_date, release_type)")
    .eq("song_id", song.id);
  const junction = (junctionRows || [])
    .map((row: any) => ({
      track_number: row.track_number,
      album: Array.isArray(row.release) ? row.release[0] : row.release,
    }))
    .find((row) => row.album && row.album.release_type !== "single") || null;

  const rawAlbum = junction?.album;
  // Include the album if it's releasable (unreleased or published). Draft albums become null.
  const album =
    rawAlbum && (rawAlbum.status === "published" || rawAlbum.status === "unreleased")
      ? rawAlbum
      : null;
  const trackNumber = album ? junction?.track_number ?? null : null;

  // Block the detail page for unreleased album tracks. Unreleased singles still resolve.
  const singleIds = await getSingleSongIds(supabase);
  const isSingle = singleIds.has(song.id);
  if (song.status === "unreleased" && album && !isSingle) {
    return null;
  }

  // Total tracks on this album (0 if standalone)
  const { count } = album
    ? await supabase
        .from("release_songs")
        .select("id", { count: "exact", head: true })
        .eq("release_id", album.id)
    : { count: 0 };

  // Published expansions for this song
  const { data: expansions } = await supabase
    .from("expansions")
    .select("id, title, slug, body")
    .eq("song_id", song.id)
    .eq("status", "published")
    .order("display_order")
    .order("created_at");

  // Published visibility sections
  const { data: visibilitySections } = await supabase
    .from("song_visibility_sections")
    .select("id, category, content, direct_answer, key_points")
    .eq("song_id", song.id)
    .eq("status", "published")
    .order("display_order");

  // Featured art (curated on song editor, shown on song page)
  const { data: featuredArt } = await supabase
    .from("songs_featured_art")
    .select("position, art:art_pieces(id, slug, title, image_path, image_alt, hero_focal_x, hero_focal_y, hero_zoom, art_summary, status)")
    .eq("song_id", song.id)
    .order("position");

  const pairedArt = ((featuredArt as { art: (PairedArt & { status: string }) | null }[] | null) || [])
    .map((p) => p.art)
    .filter((a): a is PairedArt & { status: string } => !!a && (a.status === "published" || a.status === "unreleased"))
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructure drops `status` after filtering on it above
    .map(({ status: _status, ...rest }) => rest);

  // Convert ALL visibility sections to render-ready data. Centralized in
  // renderSection so any markdown-bearing field (content, key_points,
  // future additions) is converted in exactly one place.
  const renderedSections = await Promise.all(
    (visibilitySections || []).map((s: any) => renderSection(s))
  );

  // Pull songs mentioned by the Connections section so the page can render
  // a song-art grid for them. Excludes the current song to avoid self-ref.
  const connectionsSection = renderedSections.find((s) => s.category === "connections");
  const mentionedSlugs = connectionsSection
    ? extractSongSlugs(connectionsSection).filter((slug) => slug !== song.slug)
    : [];

  let connectionsSongs: Array<{ id: string; slug: string; title: string; art_image_path: string | null; art_alt: string | null }> = [];
  if (mentionedSlugs.length > 0) {
    // Pull each mentioned song with its album cover so album tracks that
    // never got their own art still surface a visual (the album cover).
    const { data: connSongs } = await supabase
      .from("songs")
      .select("id, slug, title, art_image_path, art_alt, album_songs(release:releases(cover_art_path, cover_art_alt))")
      .in("slug", mentionedSlugs)
      .in("status", ["unreleased", "published"]);
    // Preserve the mention order so the grid mirrors the prose flow.
    const bySlug = new Map(
      (connSongs || []).map((s: any) => {
        const albumCover = s.album_songs?.[0]?.album?.cover_art_path || null;
        const albumAlt = s.album_songs?.[0]?.album?.cover_art_alt || null;
        return [
          s.slug,
          {
            id: s.id,
            slug: s.slug,
            title: s.title,
            art_image_path: s.art_image_path || albumCover,
            art_alt: s.art_alt || albumAlt,
          },
        ];
      })
    );
    connectionsSongs = mentionedSlugs
      .map((slug) => bySlug.get(slug))
      .filter((s): s is typeof connectionsSongs[number] => !!s && !!s.art_image_path);
  }

  return {
    album,
    song: { ...song, track_number: trackNumber ?? 1 },
    totalTracks: count || 0,
    expansions: expansions || [],
    visibilitySections: renderedSections,
    pairedArt,
    connectionsSongs,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await getSongData(slug);
  if (!result) return {};

  const { song, album } = result;
  const releaseLabel = album ? album.title : "Single";
  const title = song.seo_title || `${song.title} — ${releaseLabel} — Chad Lewine`;
  const description =
    song.seo_description ||
    song.citation_summary ||
    song.song_summary ||
    (album ? `${song.title} from ${album.title} by Chad Lewine.` : `${song.title} by Chad Lewine.`);
  const ogImage = song.art_image_path || album?.cover_art_path || null;
  const ogImageAlt = song.art_alt || album?.cover_art_alt || album?.title || song.title;

  return {
    title,
    description,
    alternates: {
      canonical: `https://chadlewine.com/music/songs/${slug}`,
    },
    openGraph: {
      type: "music.song",
      title,
      description,
      url: `https://chadlewine.com/music/songs/${slug}`,
      ...(ogImage ? { images: [{ url: ogImage, alt: ogImageAlt }] } : {}),
    },
  };
}

export default async function SongDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getSongData(slug);
  if (!result) notFound();

  const { album, song, totalTracks, expansions, visibilitySections, pairedArt, connectionsSongs } = result;

  const supabase = createPublicClient();
  const [badge, playbackMode, songSkusMap, releaseSkusMap] = await Promise.all([
    fetchBadge(song.title, "Chad Lewine"),
    getPlaybackMode(song.playback_mode),
    fetchSongSkusForIds(supabase, [song.id]),
    album ? fetchReleaseSkusForIds(supabase, [album.id]) : fetchReleaseSkusForIds(supabase, []),
  ]);

  // Prefer song_skus rows. If empty, fall back to a synthetic SKU built from
  // the legacy song.price + download_path_* columns so existing data still
  // sells while the schema migration is in flight.
  let songSkus = songSkusMap.get(song.id) || [];
  if (songSkus.length === 0) {
    const legacyHasDownload =
      !!(song.download_path_mp3 || song.download_path_flac || song.download_path_wav || song.download_path);
    if (song.price && legacyHasDownload) {
      songSkus = [
        {
          id: `legacy-song:${song.id}`,
          song_id: song.id,
          format: "digital" as const,
          price: Number(song.price),
          status: "available" as const,
          stock: null,
          display_order: 0,
          variants: [],
        },
      ];
    }
  }
  const releaseSkus = album ? releaseSkusMap.get(album.id) || [] : [];

  // Build section-level Q&A pairs for JSON-LD FAQPage (format stack headings + direct answers)
  const sectionHeadingMap: Record<string, string> = {
    "if-you-like": `Who should listen to "${song.title}"?`,
    audience: `Who is "${song.title}" for?`,
    world: `What is "${song.title}" about?`,
    fragments: `What are the best lines in "${song.title}"?`,
    "cultural-position": `Where does "${song.title}" fit?`,
    story: `What is the story behind "${song.title}"?`,
    breakdown: `What makes "${song.title}" work?`,
    connections: `What other songs connect to "${song.title}"?`,
    "sync-placements": `Where could "${song.title}" be placed in film, TV, or ads?`,
  };

  const sectionQAPairs = visibilitySections
    .filter((s: any) => s.directAnswer && sectionHeadingMap[s.category])
    .map((s: any) => ({
      question: sectionHeadingMap[s.category],
      answer: s.directAnswer,
    }));

  if (song.if_you_like_blurb) {
    sectionQAPairs.unshift({
      question: sectionHeadingMap["if-you-like"],
      answer: song.if_you_like_blurb,
    });
  }

  return (
    <>
      <AdminEditButton href={`/admin/music/songs/${song.slug || song.id}`} />
      <SongDetail
        song={{
          id: song.id,
          title: song.title,
          slug: song.slug,
          track_number: song.track_number,
          duration_seconds: song.duration_seconds,
          streaming_path: song.streaming_path,
          lyrics: song.lyrics,
          instrumental: song.instrumental === true,
          price: song.price,
          release_date: song.release_date,
          song_summary: song.song_summary,
          isrc: song.isrc,
          art_image_path: song.art_image_path,
          art_alt: song.art_alt,
          card_focal_x: song.card_focal_x,
          card_focal_y: song.card_focal_y,
          card_zoom: song.card_zoom,
          ringtone_price: song.ringtone_price ?? null,
          ringtone_available:
            !!song.ringtone_price &&
            !!(song.ringtone_path_m4r || song.ringtone_path_mp3),
        }}
        album={
          album
            ? {
                id: album.id,
                title: album.title,
                slug: album.slug,
                cover_art_path: album.cover_art_path,
                cover_art_alt: album.cover_art_alt,
                release_date: album.release_date,
              }
            : null
        }
        totalTracks={totalTracks}
        expansions={expansions}
        visibilitySections={visibilitySections}
        pairedArt={pairedArt}
        connectionsSongs={connectionsSongs}
        playbackMode={playbackMode}
        songSkus={songSkus.map((s) => ({
          id: s.id,
          format: s.format,
          price: s.price,
          status: s.status === "discontinued" ? "available" : s.status,
          stock: s.stock,
          variants: s.variants,
        }))}
        releaseSkus={releaseSkus.map((s) => ({
          id: s.id,
          format: s.format,
          price: s.price,
          status: s.status === "discontinued" ? "available" : s.status,
          stock: s.stock,
          variants: s.variants,
        }))}
        geoFields={{
          citation_summary: song.citation_summary,
          focus_keyphrase: song.focus_keyphrase,
          secondary_keyphrases: song.secondary_keyphrases || [],
          paa_pairs: song.paa_pairs || [],
          entity_tags: song.entity_tags || [],
          chad_quote: song.chad_quote || null,
        }}
        ifYouLike={{
          blurb: song.if_you_like_blurb || null,
          entries: Array.isArray(song.if_you_like_entries) ? song.if_you_like_entries : [],
        }}
        badge={badge ? {
          tier: badge.tier,
          tierLabel: badge.tier_label,
          tierHex: badge.tier_hex,
          charge: badge.charge,
          chargeSummary: badge.charge_summary,
          contaminated: badge.contaminated,
          contaminationNote: badge.contamination_note,
          pending: badge.pending ?? false,
          songSlug: badge.song_slug ?? null,
        } : null}
        merchSlot={<SongMerchSection songId={song.id} />}
      />
      <ExploreStrip wrap />
      {badge && album && (
        <SongChargeJsonLd
          songTitle={song.title}
          songUrl={`https://chadlewine.com/music/songs/${song.slug}`}
          albumTitle={album.title}
          albumUrl={`https://chadlewine.com/music/releases/${album.slug}`}
          badge={badge}
          citationSummary={song.citation_summary}
          focusKeyphrase={song.focus_keyphrase}
          secondaryKeyphrases={song.secondary_keyphrases || []}
          paaPairs={song.paa_pairs || []}
          sectionQAPairs={sectionQAPairs}
        />
      )}
    </>
  );
}
