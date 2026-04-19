import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // Pull external images through Vercel's image optimizer so we cache them at
    // the edge instead of hitting Supabase Storage on every request.
    remotePatterns: [
      { protocol: "https", hostname: "dyjvcjbgnvjkubrsqnym.supabase.co" },
      { protocol: "https", hostname: "**.b-cdn.net" },
    ],
  },
};

export default nextConfig;
