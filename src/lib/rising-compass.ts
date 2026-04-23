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

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
