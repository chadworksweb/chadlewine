import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
    remotePatterns: [
      { protocol: "https", hostname: "**.b-cdn.net" },
      { protocol: "https", hostname: "images-api.printify.com" },
      { protocol: "https", hostname: "images.printify.com" },
    ],
  },
};

export default nextConfig;
