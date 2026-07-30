import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Self-hosted on le-projects-01 behind le-nginx (migrated off Vercel). Standalone
  // emits .next/standalone with a minimal server.js + traced node_modules, so the
  // runtime Docker image stays lean. Harmless on Vercel (ignored there).
  output: "standalone",
  // Don't 308 trailing-slash variants -- PostHog hits /ingest/e/ etc. and the
  // redirect would break the proxied POSTs.
  skipTrailingSlashRedirect: true,
  // A stray package-lock.json in C:\Users\chad made Next infer the home folder
  // as the workspace root, so its file tracer/watcher crawled all of Dropbox,
  // Local Sites, OneDrive, AppData -- grinding dev to a halt. Pin the root to
  // this project so only the app tree is watched.
  outputFileTracingRoot: path.join(__dirname),
  allowedDevOrigins: ["10.0.0.181", "192.168.1.153"],
  experimental: {
    // proxy.ts buffers request bodies in memory; default 10MB cap cuts off
    // large media uploads (print/wallpaper/art fullres). Match server-side
    // MAX_BYTES in /api/admin/media/upload.
    proxyClientMaxBodySize: "200mb",
    // Static-generation workers. Next defaults to (cores - 1), which is 15 on
    // this machine, and 15 workers each holding a server bundle with three.js
    // in it exhausts RAM. The nine heaviest pages (/, /art, /art/murals,
    // /chad-d, /chad-lewine, /music/songs, /music/songs-over-5-minutes,
    // /observations, /transcend-spike) then blow the 60s
    // staticPageGenerationTimeout on all 3 attempts and fail the build. Fewer
    // workers is slower but finishes.
    cpus: 4,
  },
  images: {
    // Direct-Bunny: sources already live on Bunny's global CDN (*.b-cdn.net),
    // pre-compressed at upload (see CHADLEWINE-MEDIA-MIGRATION.md, "public pages
    // render <img src={bunny-url}> directly"). `unoptimized` makes every <Image>
    // emit the raw Bunny URL instead of routing through the Next optimizer, so
    // images serve from Bunny's edge worldwide (no droplet round-trip, and no
    // Cloudflare Vary:Accept cache miss). The built-in optimizer only existed to
    // dodge Supabase egress, which no longer applies now that media is on Bunny.
    unoptimized: true,
    minimumCacheTTL: 31536000,
    qualities: [100],
    remotePatterns: [
      { protocol: "https", hostname: "**.b-cdn.net" },
      { protocol: "https", hostname: "images-api.printify.com" },
      { protocol: "https", hostname: "images.printify.com" },
    ],
  },
  async rewrites() {
    // First-party PostHog proxy (ad-blocker resistant). /ingest/static/* serves
    // the JS bundle + session-replay recorder from PostHog's assets host;
    // /ingest/* carries events, flags, and replay data to the ingestion host.
    // proxy.ts excludes /ingest from its matcher so these add no middleware cost.
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
  async redirects() {
    // Pattern-based 301s for the albums -> releases entity rename. The
    // DB-backed redirects table handles per-row slug changes; these handle
    // the URL shape change itself for every album/release that ever existed.
    // Lyrics URLs (/lyrics/:slug/:track) are unchanged — only the route param
    // name was renamed (albumSlug -> releaseSlug), the on-disk URL is identical.
    return [
      {
        source: "/music/albums/:slug",
        destination: "/music/releases/:slug",
        permanent: true,
      },
      {
        source: "/admin/music/albums/:path*",
        destination: "/admin/music/releases/:path*",
        permanent: true,
      },
      // Admin posts list moved from /admin/observations to /admin/writings.
      {
        source: "/admin/observations/:path*",
        destination: "/admin/writings/:path*",
        permanent: true,
      },
      // Public posts dropped the /writings prefix: observations and journal now
      // live at the site root (/observations, /journal). These 301 the prior
      // /writings/* shape. DB-backed redirects handle per-row slug changes.
      {
        source: "/writings/observations",
        destination: "/observations",
        permanent: true,
      },
      {
        source: "/writings/observations/:slug",
        destination: "/observations/:slug",
        permanent: true,
      },
      {
        source: "/writings/journal",
        destination: "/journal",
        permanent: true,
      },
      {
        source: "/writings/journal/:slug",
        destination: "/journal/:slug",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
