const RC_API_URL = process.env.RISING_COMPASS_API_URL || "https://api.risingcompass.net";
const RC_API_KEY = process.env.RISING_COMPASS_API_KEY || "";
const RC_SERVICE_KEY = process.env.RISING_COMPASS_SERVICE_KEY || "";
const RC_KEY = RC_SERVICE_KEY || RC_API_KEY;

// If RC is slow (e.g., mid long-running admin job), we'd rather render
// the page without a badge than block SSR for minutes.
const BADGE_TIMEOUT_MS = 4000;

export interface RisingCompassBadgeData {
  tier: string;
  tier_label: string;
  tier_hex: string;
  charge: number;
  charge_summary: string | null;
  contaminated: boolean;
  contamination_note: string | null;
  // True when RC has an open misread/satirical flag on this song — the score
  // is being contested and may shift. Consumers render a "PENDING" stamp.
  pending?: boolean;
  // Canonical RC slug for this song. Use to deep-link the badge to the
  // specific song page on risingcompass.net. Null when RC has no slug
  // yet — fall back to risingcompass.net homepage.
  song_slug?: string | null;
  // --- Full-record fields (added to /api/badge/lookup; all optional so the
  // lean badge consumers keep working). Null when not yet populated. ---
  // Ether Art Chart: flat literal naming of the song.
  deadpan_line?: string | null;
  // Ether Art Chart: taxonomy slugs, dominant-first.
  topics?: string[] | null;
  // 3-paragraph per-song description of what the song transmits.
  effects_prose?: string | null;
  // 0..1 calibration confidence.
  confidence?: number | null;
  // Which calibration table matched (compass | library | submitted).
  song_source?: string | null;
}

// Build a deep-link URL to the RC song page for a badge. Falls back to the
// RC homepage when no slug is present.
export function rcBadgeHref(badge: RisingCompassBadgeData | null | undefined): string {
  if (badge?.song_slug) {
    return `https://risingcompass.net/songs/${encodeURIComponent(badge.song_slug)}`;
  }
  return "https://risingcompass.net";
}

// 24-hour cache for stable badges (recalibrations are rare; caching at scale
// cuts RC load by orders of magnitude). When a badge comes back with
// pending=true, we re-fetch fresh on subsequent renders so recal resolutions
// surface quickly instead of sitting behind a stale cached response.
const BADGE_CACHE_SECONDS = 86400;

export async function fetchBadge(
  title: string,
  artist: string,
): Promise<RisingCompassBadgeData | null> {
  if (!RC_KEY) return null;

  const params = new URLSearchParams({ title, artist });
  const url = `${RC_API_URL}/api/badge/lookup?${params}`;

  try {
    const res = await fetch(url, {
      headers: { "X-Api-Key": RC_KEY },
      next: { revalidate: BADGE_CACHE_SECONDS },
      signal: AbortSignal.timeout(BADGE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as RisingCompassBadgeData;

    // Pending badges bypass the cache so an admin-applied recalibration
    // surfaces on the next render instead of 24 hours later.
    if (data.pending) {
      const fresh = await fetch(url, {
        headers: { "X-Api-Key": RC_KEY },
        cache: "no-store",
        signal: AbortSignal.timeout(BADGE_TIMEOUT_MS),
      });
      if (fresh.ok) return (await fresh.json()) as RisingCompassBadgeData;
    }
    return data;
  } catch {
    return null;
  }
}

export interface RisingCompassAlbumBadgeData extends RisingCompassBadgeData {
  track_count: number;
  contamination_count: number;
  // Artist slug on RC — use to deep-link the album badge to the artist's
  // trajectory page (risingcompass.net/artists/<artist_slug>). RC has no
  // first-class album pages; artist page is the best next-step target.
  artist_slug?: string | null;
}

export function rcAlbumBadgeHref(badge: RisingCompassAlbumBadgeData | null | undefined): string {
  if (badge?.artist_slug) {
    return `https://risingcompass.net/artists/${encodeURIComponent(badge.artist_slug)}`;
  }
  return "https://risingcompass.net";
}

export async function fetchAlbumBadge(
  title: string,
  artist: string,
): Promise<RisingCompassAlbumBadgeData | null> {
  if (!RC_KEY) return null;

  try {
    const params = new URLSearchParams({ title, artist });
    const res = await fetch(`${RC_API_URL}/api/badge/album-lookup?${params}`, {
      headers: { "X-Api-Key": RC_KEY },
      cache: "no-store",
      signal: AbortSignal.timeout(BADGE_TIMEOUT_MS),
    });

    if (res.ok) {
      return await res.json();
    }

    // RC's /api/badge/album-lookup only resolves release_type=album.
    // Fall back to /api/artists/<slug>: its trajectory carries the same
    // album-aggregate (charge / tier / contamination) for every release
    // type (album / ep / single). Without this, EPs and singles get no
    // badge on their detail page even though RC has them calibrated.
    return await fetchAlbumBadgeFromArtistTrajectory(title, artist);
  } catch {
    return null;
  }
}

interface ArtistTrajectoryEntry {
  id: number;
  title: string;
  release_type: "album" | "ep" | "single";
  release_date: string | null;
  release_year: number | null;
  charge_value: number;
  rubric_color: string;
  tier_label: string;
  tier_hex: string;
  track_count: number;
  calibrated_count: number;
  contamination_count: number;
}

async function fetchAlbumBadgeFromArtistTrajectory(
  title: string,
  artist: string,
): Promise<RisingCompassAlbumBadgeData | null> {
  // Single-artist site: derive slug from the artist name. Lowercased,
  // hyphen-joined, ascii-only — matches RC's canonical form.
  const artistSlug = artist
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const res = await fetch(`${RC_API_URL}/api/artists/${artistSlug}`, {
    headers: { "X-Api-Key": RC_KEY },
    cache: "no-store",
    signal: AbortSignal.timeout(BADGE_TIMEOUT_MS),
  });
  if (!res.ok) return null;

  const data = (await res.json()) as { trajectory?: ArtistTrajectoryEntry[] };
  const wanted = title.trim().toLowerCase();
  const entry = (data.trajectory || []).find(
    (r) => r.title.trim().toLowerCase() === wanted,
  );
  if (!entry) return null;

  return {
    tier: entry.rubric_color,
    tier_label: entry.tier_label,
    tier_hex: entry.tier_hex,
    charge: entry.charge_value,
    charge_summary: `Album aggregate across ${entry.calibrated_count} classified track${entry.calibrated_count === 1 ? "" : "s"}.`,
    contaminated: entry.contamination_count > 0,
    contamination_note: null,
    track_count: entry.track_count,
    contamination_count: entry.contamination_count,
    artist_slug: artistSlug,
  };
}
