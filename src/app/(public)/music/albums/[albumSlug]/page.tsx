import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createPublicClient } from "@/lib/supabase-server";
import { AlbumDetail } from "@/components/AlbumDetail";
import { fetchBadge, fetchAlbumBadge, type RisingCompassBadgeData } from "@/lib/rising-compass";

export const revalidate = 60;

async function getAlbumData(albumSlug: string) {
  const supabase = createPublicClient();

  const { data: album } = await supabase
    .from("albums")
    .select("*, release_formats(label)")
    .eq("slug", albumSlug)
    .eq("status", "published")
    .single();
  if (!album) return null;

  // Get songs via junction
  const { data: junctions } = await supabase
    .from("album_songs")
    .select("track_number, song:songs(id, title, slug, duration_seconds, streaming_path, price, status)")
    .eq("album_id", album.id)
    .order("track_number");

  const songs = (junctions || [])
    .filter((j: any) => j.song?.status === "published")
    .map((j: any) => ({
      id: j.song.id,
      title: j.song.title,
      slug: j.song.slug,
      track_number: j.track_number,
      duration_seconds: j.song.duration_seconds,
      streaming_path: j.song.streaming_path,
      price: j.song.price,
    }));

  return { album, songs };
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
  return {
    title: `${album.title} — Chad Lewine`,
    description: album.description || `${album.title} by Chad Lewine.`,
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

  const { album, songs } = result;

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
      }
    : null;

  return (
    <>
      <AlbumDetail
        album={{
          id: album.id,
          title: album.title,
          slug: album.slug,
          cover_art_path: album.cover_art_path,
          cover_art_alt: album.cover_art_alt,
          release_date: album.release_date,
          description: album.description,
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
        }))}
        badge={albumBadge}
      />
      {Object.keys(songBadges).length > 0 && (
        <div style={{ maxWidth: "var(--content-width)", margin: "var(--space-xl) auto 0", padding: "0 var(--page-gutter)" }}>
          <h3 style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-tertiary)", marginBottom: "var(--space-md)" }}>
            Rising Compass Classifications
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
            {songs.map((s) => {
              const b = songBadges[s.id];
              if (!b) return null;
              return (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
                  <span style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-secondary)", minWidth: 24, textAlign: "right" }}>
                    {s.track_number}
                  </span>
                  <span style={{ fontFamily: "var(--font-ui)", fontSize: "var(--text-sm)", color: "var(--text-primary)", flex: 1 }}>
                    {s.title}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ backgroundColor: b.tier_hex, padding: "2px 8px", borderRadius: 4, fontSize: "var(--text-xs)", fontWeight: 600, color: "#000" }}>
                      {b.tier_label}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", color: "var(--text-primary)" }}>
                      {b.charge > 0 ? "+" : ""}{b.charge}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
