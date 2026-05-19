import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["10.0.0.181"],
  experimental: {
    // proxy.ts buffers request bodies in memory; default 10MB cap cuts off
    // large media uploads (print/wallpaper/art fullres). Match server-side
    // MAX_BYTES in /api/admin/media/upload.
    proxyClientMaxBodySize: "200mb",
  },
  images: {
    // Images live on Bunny pull zones (*.b-cdn.net). Long cache is safe —
    // admin flows rotate the URL when content changes.
    minimumCacheTTL: 31536000,
    // Chad compresses sources at upload time; serve them as-is. With only
    // 100 in the allowlist, Next 16 snaps any unspecified or mismatched
    // quality prop to 100 (no recompression).
    qualities: [100],
    remotePatterns: [
      { protocol: "https", hostname: "**.b-cdn.net" },
      { protocol: "https", hostname: "images-api.printify.com" },
      { protocol: "https", hostname: "images.printify.com" },
    ],
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
    ];
  },
};

export default nextConfig;
