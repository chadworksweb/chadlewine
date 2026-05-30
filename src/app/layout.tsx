import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import "@/styles/global.css";
import { SiteJsonLd } from "@/components/SiteJsonLd";
import { CartProvider, CartUI } from "@/components/Cart";
import { PlayerProvider } from "@/components/PlayerContext";
import { StickyPlayer } from "@/components/StickyPlayer";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { ConsentedAnalytics } from "@/components/ConsentedAnalytics";
import { ConsentProvider } from "@/components/ConsentProvider";
import { CONSENT_COOKIE, parseConsent, defaultConsentForCountry } from "@/lib/consent";

export const metadata: Metadata = {
  metadataBase: new URL("https://chadlewine.com"),
  title: {
    default: "Chad Lewine",
    template: "%s - Chad Lewine",
  },
  description:
    "Chad Lewine — musician. Songs at the center of a catalog that tells a life. Art, merch, and live shows.",
  authors: [{ name: "Chad Lewine", url: "https://chadlewine.com/chad-lewine" }],
  openGraph: {
    type: "website",
    siteName: "Chad Lewine",
    images: ["/og-default.webp"],
  },
  twitter: {
    card: "summary_large_image",
  },
  robots: {
    index: true,
    follow: true,
    "max-image-preview": "large",
    "max-snippet": -1,
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32" },
    ],
  },
  alternates: {
    canonical: "https://chadlewine.com",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Consent bootstrap: set window.__CL_CONSENT__ BEFORE hydration so every
  // analytics surface (PostHog, GA, custom analytics, song-play recorder) reads
  // the correct state on first paint. Cookie = the visitor's saved choice;
  // otherwise the geo default (EU/UK/EEA -> opt-in/off, elsewhere -> opt-out/on).
  // Reading cookies()+headers() makes rendering dynamic; the (public) layout
  // already reads cookies(), so public routes are dynamic regardless.
  const [cookieStore, hdrs] = await Promise.all([cookies(), headers()]);
  const raw = cookieStore.get(CONSENT_COOKIE)?.value || "";
  const decided = !!raw;
  const c = decided
    ? parseConsent(raw)
    : defaultConsentForCountry(hdrs.get("x-vercel-ip-country"));
  const bootstrap = `window.__CL_CONSENT__={decided:${decided},functional:${c.functional},analytics:${c.analytics},marketing:${c.marketing}};`;

  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <script dangerouslySetInnerHTML={{ __html: bootstrap }} />
        <SiteJsonLd />
        <ConsentProvider>
          <CartProvider>
            <PlayerProvider>
              {children}
              <StickyPlayer />
            </PlayerProvider>
            <CartUI />
          </CartProvider>
          <ConsentedAnalytics />
          <GoogleAnalytics />
        </ConsentProvider>
      </body>
    </html>
  );
}
