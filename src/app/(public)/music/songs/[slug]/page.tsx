import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createPublicClient, getPlaybackMode } from "@/lib/supabase-server";
import { SongDetail } from "@/components/SongDetail";
import { SongChargeJsonLd } from "@/components/SongChargeJsonLd";
import { YouMightAlsoLike } from "@/components/YouMightAlsoLike";
import { ExploreStrip } from "@/components/ExploreStrip";
import { AdminEditButton } from "@/components/AdminEditButton";
import { fetchBadge } from "@/lib/rising-compass";
import { renderSection, extractSongSlugs } from "@/lib/visibility-sections";
import { getSingleSongIds } from "@/lib/song-singles";
import { fetchReleaseSkusForIds, fetchSongSkusForIds } from "@/lib/release-skus";

export const revalidate = 60;

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
  type ReleaseLite = {
    id: string;
    title: string;
    slug: string;
    cover_art_path: string | null;
    cover_art_alt: string | null;
    status: string;
    release_date: string | null;
    release_type: string | null;
  };
  type JunctionRow = { track_number: number; release: ReleaseLite | ReleaseLite[] | null };
  const junction = ((junctionRows || []) as unknown as JunctionRow[])
    .map((row) => ({
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

  // Credit lines (role + name), in display order.
  const { data: credits } = await supabase
    .from("song_credits")
    .select("id, role, name")
    .eq("song_id", song.id)
    .order("display_order")
    .order("created_at");

  // Published visibility sections
  const { data: visibilitySections } = await supabase
    .from("song_visibility_sections")
    .select("id, category, content, direct_answer, key_points")
    .eq("song_id", song.id)
    .eq("status", "published")
    .order("display_order");


  // Convert ALL visibility sections to render-ready data. Centralized in
  // renderSection so any markdown-bearing field (content, key_points,
  // future additions) is converted in exactly one place.
  const renderedSections = await Promise.all(
    (visibilitySections || []).map((s) => renderSection(s)),
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
    type ConnAlbumLite = { cover_art_path: string | null; cover_art_alt: string | null };
    type ConnSongRow = {
      id: string;
      slug: string;
      title: string;
      art_image_path: string | null;
      art_alt: string | null;
      album_songs: { album: ConnAlbumLite | null }[] | null;
    };
    const bySlug = new Map(
      ((connSongs || []) as unknown as ConnSongRow[]).map((s) => {
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
    credits: credits || [],
    visibilitySections: renderedSections,
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
  const title = song.seo_title || `${song.title} — ${releaseLabel}`;
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

  const { album, song, totalTracks, expansions, credits, visibilitySections, connectionsSongs } = result;

  const supabase = createPublicClient();
  const [badge, playbackMode, songSkusMap, releaseSkusMap] = await Promise.all([
    fetchBadge(song.title, "Chad Lewine"),
    getPlaybackMode(song.playback_mode),
    fetchSongSkusForIds(supabase, [song.id]),
    // Only surface album-format SKUs when the album itself is published.
    // Unreleased albums still pass through getSongData (so the song page can
    // link to them), but their "Choose Album Format" button must not appear
    // since the album isn't on sale yet.
    album && album.status === "published"
      ? fetchReleaseSkusForIds(supabase, [album.id])
      : fetchReleaseSkusForIds(supabase, []),
  ]);

  const songSkus = songSkusMap.get(song.id) || [];
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

  type VisibilitySectionRow = { directAnswer: string | null; category: keyof typeof sectionHeadingMap };
  const sectionQAPairs: { question: string; answer: string }[] = (visibilitySections as VisibilitySectionRow[])
    .filter((s): s is VisibilitySectionRow & { directAnswer: string } => !!s.directAnswer && !!sectionHeadingMap[s.category])
    .map((s) => ({
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
          beat_peaks: Array.isArray(song.beat_peaks) ? song.beat_peaks : null,
          beat_strengths: Array.isArray(song.beat_strengths) ? song.beat_strengths : null,
          beat_kicks: Array.isArray(song.beat_kicks) ? song.beat_kicks : null,
          beat_snares: Array.isArray(song.beat_snares) ? song.beat_snares : null,
          beat_data: Array.isArray(song.beat_data) ? song.beat_data : null,
          beat_offset_seconds: typeof song.beat_offset_seconds === "number" ? song.beat_offset_seconds : null,
          bass_synth_envelope: Array.isArray(song.bass_synth_envelope) ? song.bass_synth_envelope : null,
          bass_synth_envelope_hz: typeof song.bass_synth_envelope_hz === "number" ? song.bass_synth_envelope_hz : null,
          bass_synth_pitch: Array.isArray(song.bass_synth_pitch) ? song.bass_synth_pitch : null,
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
        credits={credits}
        visibilitySections={visibilitySections}
        connectionsSongs={connectionsSongs}
        playbackMode={playbackMode}
        songSkus={songSkus.map((s) => ({
          id: s.id,
          format: s.format,
          price: s.price,
          status: s.status === "discontinued" ? "available" : s.status,
          stock: s.stock,
          gallery_images: s.gallery_images,
          variants: s.variants,
        }))}
        releaseSkus={releaseSkus.map((s) => ({
          id: s.id,
          format: s.format,
          price: s.price,
          status: s.status === "discontinued" ? "available" : s.status,
          stock: s.stock,
          gallery_images: s.gallery_images,
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
        merchSlot={<YouMightAlsoLike sourceType="song" sourceId={song.id} />}
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
