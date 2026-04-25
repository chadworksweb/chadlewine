import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getFeatureFlags, sectionForPath } from "@/lib/feature-flags";
import { lookupRedirectEdge, recordRedirectHit } from "@/lib/redirects";

// Cookie presence ≠ auth. Validate the JWT against Supabase before letting
// admin requests through; otherwise any string in `sb-access-token` would
// reach the service-role-keyed admin routes.
async function jwtIsValid(token: string): Promise<boolean> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data, error } = await supabase.auth.getUser(token);
    return !error && !!data?.user;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Admin/API-admin gate. Unauth requests return 404 (not a redirect) so the
  // secret login URL never appears in a browser bar via guess-the-path probes.
  // Direct hits to /cl-admin-6nnn are how admins log in.
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const accessToken = request.cookies.get("sb-access-token")?.value;
    const authorized = accessToken ? await jwtIsValid(accessToken) : false;
    if (!authorized) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Not Found" }, { status: 404 });
      }
      // Rewrite to a guaranteed-nonexistent path so Next renders its default
      // 404 page. URL bar still shows whatever the user typed.
      return NextResponse.rewrite(new URL("/__404_admin_mask__", request.url));
    }
    return NextResponse.next();
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

  // Only gate public routes on production. Staging/preview and local dev show everything.
  const isProduction = process.env.VERCEL_ENV === "production";
  if (!isProduction) return NextResponse.next();

  const flags = await getFeatureFlags();

  // Root → preview until the homepage itself is launched
  if (pathname === "/") {
    if (flags["homepage"] === true) return NextResponse.next();
    return NextResponse.rewrite(new URL("/preview", request.url));
  }

  // Section-scoped paths: rewrite to /preview when the section is not live
  const section = sectionForPath(pathname);
  if (section && flags[section] !== true) {
    return NextResponse.rewrite(new URL("/preview", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Run on everything except static files + Next internals + preview itself
    "/((?!_next/|preview|api/stripe-webhook|.*\\.).*)",
  ],
};
