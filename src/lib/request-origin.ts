import "server-only";

/* Behind the le-nginx reverse proxy, `new URL(request.url).origin` resolves to
   the container's own bind address (https://0.0.0.0:3006), not the public host
   the visitor typed. Anything a browser, a mail client, or Stripe has to follow
   must be built from this helper instead.

   Order matters. SITE_URL is set per instance in the deploy .env (prod,
   staging, local dev all differ), so it is both correct and un-spoofable. The
   forwarded headers are the fallback for any context that lacks it, and the
   request URL is the last resort. */

export function publicOrigin(request: Request): string {
  const configured = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    const proto =
      request.headers.get("x-forwarded-proto") ??
      new URL(request.url).protocol.replace(":", "");
    return `${proto}://${host}`;
  }

  return new URL(request.url).origin;
}
