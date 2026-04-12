import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createPublicClient, getPlaybackMode } from "@/lib/supabase-server";
import { SongDetail } from "@/components/SongDetail";
import { SongChargeJsonLd } from "@/components/SongChargeJsonLd";
import { fetchBadge } from "@/lib/rising-compass";
import { markdownToHtml } from "@/lib/markdown";

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

  // Get album via junction (optional — singles have no album)
  const { data: junction } = await supabase
    .from("album_songs")
    .select("track_number, album:albums(id, title, slug, cover_art_path, cover_art_alt, price, status)")
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
    .select("id, category, content")
    .eq("song_id", song.id)
    .eq("status", "published")
    .order("display_order");

  // Published composition (takes priority over raw sections)
  const { data: composition } = await supabase
    .from("song_composition")
    .select("id, content_html, status")
    .eq("song_id", song.id)
    .eq("status", "published")
    .single();

  // Convert visibility markdown to HTML (fallback if no composition)
  const renderedSections = composition ? [] : await Promise.all(
    (visibilitySections || []).map(async (s: any) => ({
      ...s,
      contentHtml: s.content ? await markdownToHtml(s.content) : "",
    }))
  );

  return {
    album,
    song: { ...song, track_number: trackNumber ?? 1 },
    totalTracks: count || 0,
    expansions: expansions || [],
    visibilitySections: renderedSections,
    composition: composition ? { contentHtml: composition.content_html } : null,
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

  const { album, song, totalTracks, expansions, visibilitySections, composition } = result;

  const [badge, playbackMode] = await Promise.all([
    fetchBadge(song.title, "Chad Lewine"),
    getPlaybackMode(song.playback_mode),
  ]);

  return (
    <>
      <SongDetail
        song={{
          id: song.id,
          title: song.title,
          slug: song.slug,
          track_number: song.track_number,
          duration_seconds: song.duration_seconds,
          streaming_path: song.streaming_path,
          lyrics: song.lyrics,
          price: song.price,
          release_date: song.release_date,
          song_summary: song.song_summary,
          isrc: song.isrc,
          art_image_path: song.art_image_path,
          art_alt: song.art_alt,
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
        composition={composition}
        playbackMode={playbackMode}
        badge={badge ? {
          tier: badge.tier,
          tierLabel: badge.tier_label,
          tierHex: badge.tier_hex,
          charge: badge.charge,
          chargeSummary: badge.charge_summary,
          contaminated: badge.contaminated,
          contaminationNote: badge.contamination_note,
        } : null}
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
        />
      )}
    </>
  );
}
