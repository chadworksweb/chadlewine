import "server-only";
import { createDecipheriv } from "node:crypto";
import { createAdminClient } from "@/lib/supabase-server";
import { signFanTrackUrl, fetchFanTrackPlaylist } from "@/lib/bunny-hls";

/* The Tripwire check registry.

   Every check here exists because the thing it asserts has actually broken in
   production. None of them look for exceptions; each one states a fact that
   must remain true and reports when it stops being true. Adding a check is a
   code change with no migration, because the DB stores results only.

   A check returns:
     ok   - the asserted fact holds
     fail - it does not, and `detail` says which assertion broke
     skip - the check could not run for a benign reason (nothing published to
            test, no traffic in the window). Never alerts. Distinguishing skip
            from ok matters: a check that silently passes because it had
            nothing to look at is how you end up trusting a green board that
            is not testing anything. */

export type CheckStatus = "ok" | "fail" | "skip";

export interface CheckResult {
  status: CheckStatus;
  detail: string;
}

export interface TripwireCheck {
  id: string;
  label: string;
  // Shown in the panel under the check name. Says what breaks in the real
  // world when this trips, not what the code does.
  because: string;
  run: () => Promise<CheckResult>;
}

export function siteUrl(): string {
  return (
    process.env.SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://chadlewine.com"
  ).replace(/\/+$/, "");
}

export type TripwireEnvironment = "local" | "staging" | "prod";

// Which board this process writes to. Derived from SITE_URL rather than
// NODE_ENV, because prod and staging are both production builds against the
// same Supabase and only SITE_URL tells them apart. Without this, a sweep
// from localhost overwrites prod's board.
export function currentEnvironment(): TripwireEnvironment {
  const host = siteUrl();
  if (host === "https://chadlewine.com") return "prod";
  if (host === "https://staging.chadlewine.com") return "staging";
  return "local";
}

/* --- Origin checks -------------------------------------------------------

   Canaries for publicOrigin(), NOT coverage of the unsubscribe flow.

   `new URL(request.url).origin` resolves to the container's own bind address
   behind the le-nginx proxy, and from 2026-07-05 to 2026-08-11 these two
   routes answered a GET with a 303 pointing at https://0.0.0.0:3006.

   Real recipients never hit that. The visible link in an email points at the
   /unsubscribe and /confirm PAGES, built by siteOrigin() from env, and RFC
   8058 one-click POSTs rather than GETs. So a green light here does not mean
   the unsubscribe flow works; it means publicOrigin() still resolves
   correctly behind the proxy. That matters because the same helper builds the
   Stripe billing-portal return_url, which is a real user path and cannot be
   probed without creating a portal session. */

async function probeRedirectOrigin(
  path: string,
  routeLabel: string,
): Promise<CheckResult> {
  const base = siteUrl();
  const url = `${base}${path}?token=__tripwire_probe__`;
  let res: Response;
  try {
    res = await fetch(url, { redirect: "manual", cache: "no-store" });
  } catch (e) {
    return { status: "fail", detail: `${routeLabel} unreachable: ${(e as Error).message}` };
  }

  const location = res.headers.get("location");
  if (!location) {
    return {
      status: "fail",
      detail: `${routeLabel} returned ${res.status} with no Location header; expected a 303 redirect`,
    };
  }
  // Relative Location is fine and correct; the browser resolves it against
  // the request origin. Only an absolute URL can point somewhere wrong.
  if (location.startsWith("/")) {
    return { status: "ok", detail: `${routeLabel} -> ${location} (relative, resolves to the request origin)` };
  }
  let host: string;
  try {
    host = new URL(location).origin;
  } catch {
    return { status: "fail", detail: `${routeLabel} -> unparseable Location: ${location}` };
  }
  if (host !== base) {
    return {
      status: "fail",
      detail: `${routeLabel} -> ${host}, expected ${base}. Recipients following this link land nowhere.`,
    };
  }
  return { status: "ok", detail: `${routeLabel} -> ${host}` };
}

/* --- Fan-track CDN checks ------------------------------------------------

   The pull zone serves segments over a different origin than the page, so
   hls.js can only read them if Bunny sends Access-Control-Allow-Origin. It
   did not, for as long as the feature existed, which meant playback had never
   once worked outside Safari's native HLS path. The header is a dashboard
   toggle scoped to a file-extension list, so it can be switched off or lose
   the `ts` extension without anyone touching this repo. */

async function firstPublishedTrack() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("fan_tracks")
    .select("slug, title, hls_playlist_path, hls_key_b64")
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as
    | { slug: string; title: string; hls_playlist_path: string; hls_key_b64: string }
    | null;
}

async function firstSegmentPath(playlistPath: string): Promise<string | null> {
  const playlist = await fetchFanTrackPlaylist(playlistPath);
  const baseDir = playlistPath.replace(/[^/]+$/, "");
  const line = playlist.split(/\r?\n/).find((l) => l && !l.startsWith("#"));
  if (!line) return null;
  return line.startsWith("http") ? line : baseDir + line;
}

const checkCdnCors: TripwireCheck = {
  id: "fan_track_cdn_cors",
  label: "Fan-track CDN sends CORS headers",
  because:
    "Without Access-Control-Allow-Origin on .ts segments, the browser refuses to read them and playback fails everywhere except Safari.",
  run: async () => {
    const track = await firstPublishedTrack();
    if (!track) return { status: "skip", detail: "No published fan track to probe" };

    const segPath = await firstSegmentPath(track.hls_playlist_path);
    if (!segPath) {
      return { status: "fail", detail: `Playlist for ${track.slug} contains no segment lines` };
    }

    const res = await fetch(signFanTrackUrl(segPath, 120), {
      headers: { Origin: siteUrl() },
      cache: "no-store",
    });
    if (!res.ok) {
      return { status: "fail", detail: `Segment fetch returned ${res.status} ${res.statusText}` };
    }
    const acao = res.headers.get("access-control-allow-origin");
    if (!acao) {
      return {
        status: "fail",
        detail:
          "Segment served 200 but sent no Access-Control-Allow-Origin. Check the pull zone's CORS extension list still includes ts and m3u8.",
      };
    }
    return { status: "ok", detail: `Access-Control-Allow-Origin: ${acao}` };
  },
};

const checkTrackPlayable: TripwireCheck = {
  id: "fan_track_playable",
  label: "Fan-track audio decrypts to real audio",
  because:
    "Proves the stored AES key still matches the uploaded segments. A mismatch serves bytes that decrypt to noise, and the player reports a generic load error.",
  run: async () => {
    const track = await firstPublishedTrack();
    if (!track) return { status: "skip", detail: "No published fan track to probe" };

    const segPath = await firstSegmentPath(track.hls_playlist_path);
    if (!segPath) {
      return { status: "fail", detail: `Playlist for ${track.slug} contains no segment lines` };
    }

    const key = Buffer.from(track.hls_key_b64, "base64");
    if (key.length !== 16) {
      return { status: "fail", detail: `Stored key for ${track.slug} is ${key.length} bytes, expected 16` };
    }

    const res = await fetch(signFanTrackUrl(segPath, 120), { cache: "no-store" });
    if (!res.ok) {
      return { status: "fail", detail: `Segment fetch returned ${res.status} ${res.statusText}` };
    }
    const encrypted = Buffer.from(await res.arrayBuffer());

    // The ingest writes IV=0 for every segment (see ingest-fan-track.ts).
    let decrypted: Buffer;
    try {
      const d = createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, 0));
      decrypted = Buffer.concat([d.update(encrypted), d.final()]);
    } catch (e) {
      return { status: "fail", detail: `Decrypt failed for ${track.slug}: ${(e as Error).message}` };
    }
    // 0x47 is the MPEG-TS sync byte. Wrong key decrypts to something else.
    if (decrypted[0] !== 0x47) {
      return {
        status: "fail",
        detail: `Decrypted segment starts 0x${decrypted[0]?.toString(16)}, expected 0x47 (MPEG-TS sync). Key and media are out of sync.`,
      };
    }
    return {
      status: "ok",
      detail: `${track.title}: ${decrypted.length} bytes decrypt to valid MPEG-TS`,
    };
  },
};

/* --- Turnstile -----------------------------------------------------------

   Not "is Turnstile up". A real outage and one visitor on an odd browser look
   identical in isolation, which is exactly the trap that cost an hour on
   2026-08-11. The signal that separates them is the ratio: failures with no
   successes anywhere in the window means the gate is down for everyone. Any
   success in the window means the gate works and someone's browser did not. */

const TURNSTILE_WINDOW_MIN = 60;
const TURNSTILE_MIN_FAILURES = 3;

const checkTurnstile: TripwireCheck = {
  id: "turnstile_login_health",
  label: "Login bot check is not blocking everyone",
  because:
    "Turnstile refusing one unusual browser is correct. Turnstile refusing every visitor with zero successes is an outage, and nobody can sign in.",
  run: async () => {
    const supabase = createAdminClient();
    const since = new Date(Date.now() - TURNSTILE_WINDOW_MIN * 60_000).toISOString();
    const { data, error } = await supabase
      .from("auth_attempts")
      .select("success, reason")
      .eq("action", "login")
      .gte("created_at", since);

    if (error) return { status: "fail", detail: `auth_attempts query failed: ${error.message}` };

    const rows = data ?? [];
    const failures = rows.filter((r) => r.reason === "turnstile_failed").length;
    const successes = rows.filter((r) => r.success).length;

    if (failures < TURNSTILE_MIN_FAILURES) {
      return {
        status: "skip",
        detail: `${failures} bot-check failures in ${TURNSTILE_WINDOW_MIN}m, below the ${TURNSTILE_MIN_FAILURES} needed to judge`,
      };
    }
    if (successes > 0) {
      return {
        status: "ok",
        detail: `${failures} bot-check failures but ${successes} successful logins in ${TURNSTILE_WINDOW_MIN}m, so the gate works`,
      };
    }
    return {
      status: "fail",
      detail: `${failures} bot-check failures and zero successful logins in ${TURNSTILE_WINDOW_MIN}m. Nobody is getting in.`,
    };
  },
};

export const TRIPWIRE_CHECKS: TripwireCheck[] = [
  {
    id: "public_origin_unsubscribe",
    label: "publicOrigin() resolves to the site",
    because:
      "Behind the proxy this helper once resolved to the container's own address. It builds the Stripe billing-portal return URL, which sends a paying member nowhere when it breaks. Does NOT cover the unsubscribe flow: emails link to the /unsubscribe page, not this route.",
    run: () => probeRedirectOrigin("/api/unsubscribe", "/api/unsubscribe"),
  },
  {
    id: "public_origin_confirm",
    label: "publicOrigin() resolves on a second route",
    because:
      "Same helper, independent route, so a regression that somehow touches only one of them still surfaces. Also not coverage of double opt-in: those emails link to the /confirm page.",
    run: () => probeRedirectOrigin("/api/confirm", "/api/confirm"),
  },
  checkCdnCors,
  checkTrackPlayable,
  checkTurnstile,
];

export function findCheck(id: string): TripwireCheck | undefined {
  return TRIPWIRE_CHECKS.find((c) => c.id === id);
}
