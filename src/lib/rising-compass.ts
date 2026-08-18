import { createAdminClient } from "@/lib/supabase-server";

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
  // 3-paragraph per-song description of what the song transmits (legacy single field).
  effects_prose?: string | null;
  // "Effects (per listen)" prose — what one listen transmits to the individual.
  listener_effects_prose?: string | null;
  // "At scale" prose — what the song does at population scale.
  societal_effects_prose?: string | null;
  // 0..1 calibration confidence.
  confidence?: number | null;
  // Which calibration table matched (compass | library | submitted).
  song_source?: string | null;
  // --- Psyche Facts family (RC is the source; chadlewine renders these) ---
  // The "Drug Facts" prescription bundle. Same shape as SongLabel's
  // PsycheFactsMeta minus the retired effects[]/at_scale[] bullets.
  psyche_facts?: RcPsycheFacts | null;
  // Per-listen effects: the raw slugs, plus display detail ({slug,label,shadow})
  // for rendering + valence styling. From the closed RC-owned vocabulary.
  effects_pl?: string[] | null;
  effects_pl_labels?: EffectPlLabel[] | null;
}

// The per-listen effect tag shape the badge returns.
export interface EffectPlLabel {
  slug: string;
  label: string;
  shadow: boolean;
}

// The RC-owned prescription bundle (no effects[]/at_scale[] — those are retired).
export interface RcPsycheFacts {
  purpose?: string | null;
  indicated_for?: string[] | null;
  do_not_use_if?: string | null;
  directions?: string | null;
  onset?: string | null;
  duration?: string | null;
  warning?: string | null;
}

// Build a deep-link URL to the RC song page for a badge. Falls back to the
// RC homepage when no slug is present.
export function rcBadgeHref(badge: RisingCompassBadgeData | null | undefined): string {
  if (badge?.song_slug) {
    return `https://risingcompass.net/songs/${encodeURIComponent(badge.song_slug)}`;
  }
  return "https://risingcompass.net";
}

// Lowercased, hyphen-joined, ascii-only -- matches RC's canonical artist slug
// form (same derivation used by fetchAlbumBadgeFromArtistTrajectory).
export function rcArtistSlug(artist: string): string {
  return artist
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Deep-link to an artist's trajectory page on RC, derived from the artist name.
export function rcArtistHref(artist: string): string {
  const slug = rcArtistSlug(artist);
  return slug ? `https://risingcompass.net/artists/${slug}` : "https://risingcompass.net";
}

// Local-first badge cache. Badges almost never change, so the render path reads
// from our own `rc_badge_cache` table (populated lazily on first lookup and kept
// fresh by RC's classification webhook) instead of calling RC live every render.
// RC is only ever hit on a cold miss or after the TTL backstop expires; that one
// miss then populates the cache, so steady-state RC traffic is ~zero. See
// /api/webhooks/rc-classification for the push side.
const BADGE_CACHE_TABLE = "rc_badge_cache";
// Positive entries are trusted for 30 days (the webhook refreshes them in real
// time; this is only a backstop for a missed push). Negative ("RC has no
// calibration") entries re-check daily, so a newly-calibrated song surfaces
// within a day even with no webhook.
const BADGE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const BADGE_NEG_TTL_MS = 24 * 60 * 60 * 1000;

// Canonical, case-insensitive key for a (title, artist) pair. Must match the
// derivation the webhook receiver uses so a push lands on the same row.
export function badgeCacheKey(title: string, artist: string): string {
  return `${title.trim().toLowerCase()}${artist.trim().toLowerCase()}`;
}

interface BadgeCacheRow {
  badge: RisingCompassBadgeData | null;
  not_found: boolean;
  fetched_at: string;
}

// Batch-read the local badge cache for many songs in one query (list pages).
// Cache-only, no per-song live refresh, so it stays a single round-trip; entries
// are kept warm by detail-page read-throughs + webhook pushes. Uncalibrated or
// cold songs are simply absent from the map (caller renders no badge data).
// Returns a Map keyed by badgeCacheKey(title, artist).
export async function fetchBadgesCached(
  items: { title: string; artist: string }[],
): Promise<Map<string, RisingCompassBadgeData>> {
  const out = new Map<string, RisingCompassBadgeData>();
  if (!RC_KEY || items.length === 0) return out;
  try {
    const supabase = createAdminClient();
    const keys = items.map((i) => badgeCacheKey(i.title, i.artist));
    const { data } = await supabase
      .from(BADGE_CACHE_TABLE)
      .select("cache_key, badge, not_found")
      .in("cache_key", keys);
    for (const row of (data ?? []) as {
      cache_key: string;
      badge: RisingCompassBadgeData | null;
      not_found: boolean;
    }[]) {
      if (!row.not_found && row.badge) out.set(row.cache_key, row.badge);
    }
  } catch {
    /* fail-soft: no effect tags rather than a broken list page */
  }
  return out;
}

// Live RC lookup. Returns the full record, or null when RC has no calibration
// (404) or the call fails. Split out so both the read-through path and any
// direct caller share one implementation.
async function fetchBadgeLive(
  title: string,
  artist: string,
): Promise<{ badge: RisingCompassBadgeData | null; ok: boolean }> {
  if (!RC_KEY) return { badge: null, ok: false };
  const params = new URLSearchParams({ title, artist });
  const url = `${RC_API_URL}/api/badge/lookup?${params}`;
  try {
    const res = await fetch(url, {
      headers: { "X-Api-Key": RC_KEY },
      cache: "no-store",
      signal: AbortSignal.timeout(BADGE_TIMEOUT_MS),
    });
    if (res.status === 404) return { badge: null, ok: true }; // RC has no calibration
    if (!res.ok) return { badge: null, ok: false }; // transient; don't poison the cache
    return { badge: (await res.json()) as RisingCompassBadgeData, ok: true };
  } catch {
    return { badge: null, ok: false };
  }
}

// Write-through to the cache. Fail-soft: a missing table or any error must never
// break rendering (the live result is already in hand).
async function writeBadgeCache(
  title: string,
  artist: string,
  badge: RisingCompassBadgeData | null,
): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from(BADGE_CACHE_TABLE).upsert(
      {
        cache_key: badgeCacheKey(title, artist),
        title: title.trim(),
        artist: artist.trim(),
        rc_song_id: null,
        badge,
        not_found: badge === null,
        source: "lookup",
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "cache_key" },
    );
  } catch {
    /* fail-soft: cache is an optimization, never a hard dependency */
  }
}

export async function fetchBadge(
  title: string,
  artist: string,
): Promise<RisingCompassBadgeData | null> {
  if (!RC_KEY) return null;

  // 1. Read-through the local cache.
  let cached: BadgeCacheRow | null = null;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from(BADGE_CACHE_TABLE)
      .select("badge, not_found, fetched_at")
      .eq("cache_key", badgeCacheKey(title, artist))
      .maybeSingle();
    cached = (data as BadgeCacheRow | null) ?? null;
  } catch {
    cached = null; // table missing / read error -> behave as a cold miss
  }

  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at).getTime();
    const ttl = cached.not_found ? BADGE_NEG_TTL_MS : BADGE_TTL_MS;
    const fresh = age < ttl;
    // A pending (contested) reading always re-validates so a resolution surfaces
    // immediately instead of waiting out the TTL.
    if (fresh && !cached.badge?.pending) {
      return cached.not_found ? null : cached.badge;
    }
  }

  // 2. Cold miss / stale / pending -> one live RC call, then populate the cache.
  const { badge, ok } = await fetchBadgeLive(title, artist);
  if (ok) {
    await writeBadgeCache(title, artist, badge);
    return badge;
  }
  // Transient RC failure: serve a stale cached value if we have one.
  return cached && !cached.not_found ? cached.badge : null;
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
