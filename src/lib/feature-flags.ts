const CACHE_TTL_MS = 30_000;

type FlagMap = Record<string, boolean>;

let cache: { data: FlagMap; expires: number } | null = null;
let inflight: Promise<FlagMap> | null = null;

async function fetchFlags(): Promise<FlagMap> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return {};

  const res = await fetch(
    `${url}/rest/v1/feature_flags?select=section,is_live`,
    {
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
      cache: "no-store",
    }
  );
  if (!res.ok) return {};
  const rows = (await res.json()) as Array<{ section: string; is_live: boolean }>;
  return Object.fromEntries(rows.map((r) => [r.section, r.is_live]));
}

export async function getFeatureFlags(): Promise<FlagMap> {
  const now = Date.now();
  if (cache && cache.expires > now) return cache.data;
  if (inflight) return inflight;
  inflight = fetchFlags()
    .then((data) => {
      cache = { data, expires: Date.now() + CACHE_TTL_MS };
      return data;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function isSectionLive(section: string): Promise<boolean> {
  const flags = await getFeatureFlags();
  return flags[section] === true;
}

// Maps a URL pathname to its section key. Returns null if the path is not
// controlled by a section flag (e.g. /, /admin, /api, /login, /preview, static).
export function sectionForPath(pathname: string): string | null {
  if (pathname === "/" || pathname === "") return null;
  if (pathname.startsWith("/admin")) return null;
  if (pathname.startsWith("/api")) return null;
  if (pathname.startsWith("/login")) return null;
  if (pathname.startsWith("/preview")) return null;
  if (pathname.startsWith("/_next")) return null;
  if (pathname.startsWith("/archive")) return null;

  const seg = pathname.split("/").filter(Boolean)[0];
  if (!seg) return null;

  const SECTION_SEGMENTS = new Set([
    "observations",
    "meditations",
    "music",
    "curation",
    "art",
    "video",
    "lyrics",
    "foundations",
    "doors",
    "chad-lewine",
    "thinking",
    "discography",
  ]);

  if (seg === "discography") return "music";
  return SECTION_SEGMENTS.has(seg) ? seg : null;
}
