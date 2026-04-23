import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // Supabase Storage serves `Cache-Control: no-cache`, so Vercel re-fetches
    // from origin every `minimumCacheTTL` window. Next.js 16 default is 4h;
    // raise to 1 year — image updates go through admin flows that can trigger
    // revalidation or swap the URL, so long-lived cache is safe.
    minimumCacheTTL: 31536000,
    // Pull external images through Vercel's image optimizer so we cache them at
    // the edge instead of hitting Supabase Storage on every request.
    remotePatterns: [
      { protocol: "https", hostname: "dyjvcjbgnvjkubrsqnym.supabase.co" },
      { protocol: "https", hostname: "**.b-cdn.net" },
    ],
  },
};

export default nextConfig;
