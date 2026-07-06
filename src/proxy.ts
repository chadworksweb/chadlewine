import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { lookupRedirectEdge, recordRedirectHit } from "@/lib/redirects";
import { CONSENT_COOKIE, isOptInGeo } from "@/lib/consent";

type AuthResult = {
  ok: boolean;
  newAccess?: string;
  newRefresh?: string;
};

async function checkAdmin(userId: string): Promise<boolean> {
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: row } = await adminClient
    .from("admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  return !!row;
}

// Cookie presence != auth. Validate the JWT against Supabase AND confirm
// the user is in the `admins` table.
//
// When the access token is stale, attempt a refresh-token exchange (in every
// environment when allowRefresh is set). Refreshed tokens are returned so the
// proxy can write them back as cookies on the response, sliding the 30-day
// window forward on each admin request.
async function authAdmin(
  accessToken: string | undefined,
  refreshToken: string | undefined,
  allowRefresh: boolean,
): Promise<AuthResult> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  if (accessToken) {
    try {
      const { data, error } = await supabase.auth.getUser(accessToken);
      if (!error && data?.user && (await checkAdmin(data.user.id))) {
        return { ok: true };
      }
    } catch {
      // fall through to refresh attempt
    }
  }

  if (allowRefresh && refreshToken) {
    try {
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });
      if (!error && data.session && data.user && (await checkAdmin(data.user.id))) {
        return {
          ok: true,
          newAccess: data.session.access_token,
          newRefresh: data.session.refresh_token,
        };
      }
    } catch {
      return { ok: false };
    }
  }

  return { ok: false };
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Admin/API-admin gate. Unauth requests return 404 (not a redirect) so the
  // secret login URL never appears in a browser bar via guess-the-path probes.
  // Direct hits to /cl-admin-6nnn are how admins log in.
  //
  // EXCEPT /api/admin/login — that's the unauth-by-design login endpoint
  // itself. Hardening (rate limit + lockout + audit) lives inside the
  // route handler, not at the proxy.
  if (pathname === "/api/admin/login") {
    return NextResponse.next();
  }
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const accessToken = request.cookies.get("sb-access-token")?.value;
    const refreshToken = request.cookies.get("sb-refresh-token")?.value;
    // Refresh-on-stale everywhere (local AND Vercel). The 1h access cookie is
    // meant to be silently renewed from the 30-day refresh cookie; gating this
    // to local-only is what made "stay logged in 30 days" fail in production --
    // admins were hard-logged-out the moment the access token expired.
    const allowRefresh = true;
    const auth = await authAdmin(accessToken, refreshToken, allowRefresh);
    if (!auth.ok) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Not Found" }, { status: 404 });
      }
      // Rewrite to a guaranteed-nonexistent path so Next renders its default
      // 404 page. URL bar still shows whatever the user typed.
      return NextResponse.rewrite(new URL("/__404_admin_mask__", request.url));
    }
    const response = NextResponse.next();
    if (auth.newAccess && auth.newRefresh) {
      const isProduction = process.env.NODE_ENV === "production";
      response.cookies.set("sb-access-token", auth.newAccess, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60,
      });
      response.cookies.set("sb-refresh-token", auth.newRefresh, {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    return response;
  }

  // Redirect table: check before any route resolution, so renamed content
  // preserves link equity. Runs on public paths only.
  if (!pathname.startsWith("/api")) {
    const redirect = await lookupRedirectEdge(pathname);
    if (redirect && redirect.to_path !== pathname) {
      void recordRedirectHit(pathname);
      const target = new URL(redirect.to_path, request.url);
      target.search = request.nextUrl.search;
      return NextResponse.redirect(target, redirect.status_code);
    }
  }

  // Feature-flag launch gating retired (2026-05-26): staging is the go-between,
  // so whatever reaches master is live. No section hiding on production. The
  // feature_flags table + launch-control admin remain dormant (cross-sell still
  // reads flags). Gate by not merging to master, not by flags.
  //
  // Consent geo-default (edge): first-time visitors with no saved consent choice
  // get a cl_geo_default cookie ("deny" for EU/UK/EEA + California AND for any
  // unknown region -- e.g. self-hosted where geo headers are absent; "allow"
  // only for a known non-opt-in country). The
  // root-layout inline script reads it to set the pre-hydration consent default
  // WITHOUT the layout calling cookies()/headers() -- which would force every
  // public page to dynamic rendering and defeat ISR. Only set on the first hit
  // (neither cookie present), so steady-state responses stay cache-clean.
  const res = NextResponse.next();
  if (
    !pathname.startsWith("/api") &&
    !request.cookies.get(CONSENT_COOKIE)?.value &&
    !request.cookies.get("cl_geo_default")?.value
  ) {
    // Geo signal for the consent default. Self-hosted behind Cloudflare we read
    // CF-IPCountry (sent on every request) and CF-Region-Code (needs the
    // "Add visitor location headers" managed transform enabled in Cloudflare).
    // Fall back to Vercel's x-vercel-ip-* if this ever runs on Vercel again.
    // Cloudflare uses "XX" (unknown) / "T1" (Tor) -> treat as unknown.
    // Rule: unknown region => "deny" (privacy-safe opt-in, never default EU/UK/
    // EEA or California to analytics-on); a KNOWN non-opt-in country => "allow".
    const cfCountry = request.headers.get("cf-ipcountry");
    const country =
      (cfCountry && cfCountry !== "XX" && cfCountry !== "T1" ? cfCountry : null) ||
      request.headers.get("x-vercel-ip-country");
    const region =
      request.headers.get("cf-region-code") ||
      request.headers.get("x-vercel-ip-country-region");
    const def = !country || isOptInGeo(country, region) ? "deny" : "allow";
    res.cookies.set("cl_geo_default", def, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return res;
}

export const config = {
  matcher: [
    // Run on everything except static files + Next internals + preview itself
    // + the PostHog /ingest proxy (rewritten in next.config; no auth/redirect
    // logic applies, and skipping it avoids a redirect-table lookup per event).
    "/((?!_next/|preview|ingest/|api/stripe-webhook|.*\\.).*)",
  ],
};
