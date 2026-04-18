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
}

export async function fetchBadge(
  title: string,
  artist: string,
): Promise<RisingCompassBadgeData | null> {
  if (!RC_KEY) return null;

  try {
    const params = new URLSearchParams({ title, artist });
    const res = await fetch(`${RC_API_URL}/api/badge/lookup?${params}`, {
      headers: { "X-Api-Key": RC_KEY },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(BADGE_TIMEOUT_MS),
    });

    if (!res.ok) return null;
    return await res.json();
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
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(BADGE_TIMEOUT_MS),
    });

    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
