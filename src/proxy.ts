import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getFeatureFlags, sectionForPath } from "@/lib/feature-flags";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Admin/API-admin gate: unchanged
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const accessToken = request.cookies.get("sb-access-token")?.value;
    if (!accessToken) {
      const loginUrl = new URL("/cl-admin-6nnn", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
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
