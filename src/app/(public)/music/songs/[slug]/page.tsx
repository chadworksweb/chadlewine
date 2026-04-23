import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createPublicClient, getPlaybackMode } from "@/lib/supabase-server";
import { SongDetail } from "@/components/SongDetail";
import { SongChargeJsonLd } from "@/components/SongChargeJsonLd";
import { SongMerchSection } from "@/components/SongMerchSection";
import { AdminEditButton } from "@/components/AdminEditButton";
import { fetchBadge } from "@/lib/rising-compass";
import { markdownToHtml } from "@/lib/markdown";

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

  // Get album via junction (optional — singles have no album)
  const { data: junction } = await supabase
    .from("album_songs")
    .select("track_number, album:albums(id, title, slug, cover_art_path, cover_art_alt, price, status, download_path_mp3, download_path_flac, download_path_wav)")
    .eq("song_id", song.id)
    .maybeSingle();

  const rawAlbum = (junction as any)?.album;
  // Include the album if it's releasable (unreleased or published). Draft albums become null.
  const album =
    rawAlbum && (rawAlbum.status === "published" || rawAlbum.status === "unreleased")
      ? rawAlbum
      : null;
  const trackNumber = album ? (junction as any).track_number : null;

  // Block the detail page for unreleased album tracks. Unreleased singles still resolve.
  if (song.status === "unreleased" && album && !song.is_single) {
    return null;
  }

  // Total tracks on this album (0 if standalone)
  const { count } = album
    ? await supabase
        .from("album_songs")
        .select("id", { count: "exact", head: true })
        .eq("album_id", album.id)
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
    .map(({ status: _status, ...rest }) => rest);

  // Convert ALL visibility sections to HTML (used in integrated landing page)
  const renderedSections = await Promise.all(
    (visibilitySections || []).map(async (s: any) => ({
      ...s,
      contentHtml: s.content ? await markdownToHtml(s.content) : "",
      directAnswer: s.direct_answer || null,
      keyPoints: s.key_points || [],
    }))
  );

  return {
    album,
    song: { ...song, track_number: trackNumber ?? 1 },
    totalTracks: count || 0,
    expansions: expansions || [],
    visibilitySections: renderedSections,
    pairedArt,
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

  const { album, song, totalTracks, expansions, visibilitySections, pairedArt } = result;

  const [badge, playbackMode] = await Promise.all([
    fetchBadge(song.title, "Chad Lewine"),
    getPlaybackMode(song.playback_mode),
  ]);

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

  return (
    <>
      <AdminEditButton href={`/admin/music/songs/${song.id}`} />
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
        }}
        album={
          album
            ? {
                id: album.id,
                title: album.title,
                slug: album.slug,
                cover_art_path: album.cover_art_path,
                cover_art_alt: album.cover_art_alt,
                price: album.price,
              }
            : null
        }
        totalTracks={totalTracks}
        expansions={expansions}
        visibilitySections={visibilitySections}
        pairedArt={pairedArt}
        playbackMode={playbackMode}
        songFormats={(() => {
          const explicit = (["mp3", "flac", "wav"] as const).filter((f) => song[`download_path_${f}`]);
          if (explicit.length > 0) return explicit;
          return song.download_path ? ["mp3" as const] : [];
        })()}
        albumFormats={album ? (() => {
          const a = album as Record<string, unknown>;
          const explicit = (["mp3", "flac", "wav"] as const).filter((f) => a[`download_path_${f}`]);
          return explicit.length > 0 ? explicit : [];
        })() : []}
        geoFields={{
          citation_summary: song.citation_summary,
          focus_keyphrase: song.focus_keyphrase,
          secondary_keyphrases: song.secondary_keyphrases || [],
          paa_pairs: song.paa_pairs || [],
          entity_tags: song.entity_tags || [],
          chad_quote: song.chad_quote || null,
        }}
        badge={badge ? {
          tier: badge.tier,
          tierLabel: badge.tier_label,
          tierHex: badge.tier_hex,
          charge: badge.charge,
          chargeSummary: badge.charge_summary,
          contaminated: badge.contaminated,
          contaminationNote: badge.contamination_note,
        } : null}
        merchSlot={<SongMerchSection songId={song.id} />}
      />
      {badge && album && (
        <SongChargeJsonLd
          songTitle={song.title}
          songUrl={`https://chadlewine.com/music/songs/${song.slug}`}
          albumTitle={album.title}
          albumUrl={`https://chadlewine.com/music/albums/${album.slug}`}
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
