import { createPublicClient } from "@/lib/supabase-server";
import { fetchBadge, rcBadgeHref } from "@/lib/rising-compass";
import type { ReleaseTrackGridTrack } from "@/components/ReleaseTrackGrid";

// Live data sources a 'track-grid' section can reference by key (data.source).
// Keeps the DB-rendered page self-updating, exactly like the old code page.

interface SongRow {
  id: string;
  title: string;
  slug: string;
  status: string;
  duration_seconds: number | null;
  song_summary: string | null;
  art_image_path: string | null;
  art_alt: string | null;
  card_focal_x: number | null;
  card_focal_y: number | null;
}

type RelJoin = {
  cover_art_path: string | null;
  cover_art_alt: string | null;
  release_type: string | null;
};

// Any song past the five-minute mark, longest first, as Rising Compass model
// bays. Moved verbatim from the old songs-over-5-minutes page.
export async function getLongSongTracks(): Promise<ReleaseTrackGridTrack[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("songs")
    .select(
      "id, title, slug, status, duration_seconds, song_summary, art_image_path, art_alt, card_focal_x, card_focal_y",
    )
    .gt("duration_seconds", 300)
    .order("duration_seconds", { ascending: false });

  const rows = ((data || []) as SongRow[]).filter(
    (s) => s.status === "published" || s.status === "unreleased",
  );

  // Fall back to the album cover when a song carries no art of its own (skip
  // singles so we prefer real album covers), same approach as the album page.
  const needArt = rows.filter((s) => !s.art_image_path).map((s) => s.id);
  const albumArt = new Map<string, { path: string; alt: string | null }>();
  if (needArt.length > 0) {
    const { data: junctions } = await supabase
      .from("release_songs")
      .select("song_id, release:releases(cover_art_path, cover_art_alt, release_type)")
      .in("song_id", needArt);
    for (const j of (junctions || []) as Array<{ song_id: string; release: RelJoin | RelJoin[] | null }>) {
      const rel = Array.isArray(j.release) ? j.release[0] : j.release;
      if (!rel || rel.release_type === "single") continue;
      if (rel.cover_art_path && !albumArt.has(j.song_id)) {
        albumArt.set(j.song_id, { path: rel.cover_art_path, alt: rel.cover_art_alt });
      }
    }
  }

  // One Rising Compass badge per song (cached 24h), same source as the album page.
  const badges = await Promise.all(rows.map((s) => fetchBadge(s.title, "Chad Lewine")));

  return rows.map((s, i) => {
    const album = albumArt.get(s.id);
    const b = badges[i];
    return {
      id: s.id,
      slug: s.slug,
      title: s.title,
      trackNumber: i + 1,
      collection: "",
      summary: s.song_summary,
      durationSeconds: s.duration_seconds,
      art: s.art_image_path || album?.path || null,
      artAlt: s.art_alt || album?.alt || null,
      focalX: s.card_focal_x,
      focalY: s.card_focal_y,
      deadpan: b?.deadpan_line || null,
      chargeSummary: b?.charge_summary || null,
      pending: b?.pending ?? false,
      badge: b ? { tierLabel: b.tier_label, tierHex: b.tier_hex, charge: b.charge } : null,
      badgeHref: rcBadgeHref(b),
    };
  });
}

// Dispatch a track-grid section's data.source to its live fetcher.
export async function getTracksForSource(source: string | undefined): Promise<ReleaseTrackGridTrack[]> {
  switch (source) {
    case "songs_over_5min":
      return getLongSongTracks();
    default:
      return [];
  }
}
