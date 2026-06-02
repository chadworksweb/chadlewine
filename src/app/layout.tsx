import type { Metadata } from "next";
import "@/styles/global.css";
import { SiteJsonLd } from "@/components/SiteJsonLd";
import { CartProvider, CartUI } from "@/components/Cart";
import { PlayerProvider } from "@/components/PlayerContext";
import { StickyPlayer } from "@/components/StickyPlayer";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { ConsentedAnalytics } from "@/components/ConsentedAnalytics";
import { ConsentProvider } from "@/components/ConsentProvider";

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

// Consent bootstrap, client-side. Sets window.__CL_CONSENT__ BEFORE hydration so
// every analytics surface (PostHog, GA, custom analytics, song-play recorder)
// reads the correct state on first paint. Reads the saved choice from the
// cl_cookie_consent cookie; for first-time visitors it reads cl_geo_default
// (set at the edge by proxy.ts: "deny" for EU/UK/EEA, "allow" elsewhere),
// defaulting to deny when absent. This runs in the browser, so the layout no
// longer calls cookies()/headers() server-side -- which is what forced every
// public page to dynamic rendering and defeated ISR.
const CONSENT_BOOTSTRAP =
  "(function(){try{function r(n){var m=document.cookie.match(new RegExp('(?:^|; )'+n+'=([^;]*)'));return m?decodeURIComponent(m[1]):null;}" +
  "var raw=r('cl_cookie_consent'),w;" +
  "if(raw){var o={functional:0,analytics:0,marketing:0};raw.split('|').forEach(function(p){var kv=p.split(':');if(kv[0] in o)o[kv[0]]=parseInt(kv[1],10)?1:0;});w={decided:true,functional:o.functional,analytics:o.analytics,marketing:o.marketing};}" +
  "else{var allow=r('cl_geo_default')==='allow';w={decided:false,functional:allow?1:0,analytics:allow?1:0,marketing:0};}" +
  "window.__CL_CONSENT__=w;}catch(e){window.__CL_CONSENT__={decided:false,functional:0,analytics:0,marketing:0};}})();";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <script dangerouslySetInnerHTML={{ __html: CONSENT_BOOTSTRAP }} />
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
