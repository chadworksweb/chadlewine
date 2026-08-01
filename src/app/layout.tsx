import type { Metadata } from "next";
import "@/styles/global.css";
import { SiteJsonLd } from "@/components/SiteJsonLd";
import { CartProvider, CartUI } from "@/components/Cart";
import { PlayerProvider } from "@/components/PlayerContext";
import { StickyPlayer } from "@/components/StickyPlayer";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { ConsentProvider } from "@/components/ConsentProvider";
import { FORCE_MOTION_BOOTSTRAP } from "@/lib/motion";

export const metadata: Metadata = {
  metadataBase: new URL("https://chadlewine.com"),
  title: {
    default: "Chad Lewine",
    template: "%s - Chad Lewine",
  },
  description:
    "Chad Lewine is a metaphysical artist creating and distributing original music, art and thoughts to empower the individual and the collective.",
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
// (set at the edge by proxy.ts: "deny" for EU/UK/EEA + California, "allow"
// elsewhere), defaulting to deny when absent. A Global Privacy Control or Do
// Not Track browser signal then forces every optional category off, regardless
// of saved choice (CPRA recognizes GPC as a binding opt-out) -- this covers GA
// too, not just PostHog's own respect_dnt. This runs in the browser, so the
// layout no longer calls cookies()/headers() server-side -- which is what
// forced every public page to dynamic rendering and defeated ISR.
const CONSENT_BOOTSTRAP =
  "(function(){try{function r(n){var m=document.cookie.match(new RegExp('(?:^|; )'+n+'=([^;]*)'));return m?decodeURIComponent(m[1]):null;}" +
  "var raw=r('cl_cookie_consent'),w;" +
  "if(raw){var o={functional:0,analytics:0,marketing:0};raw.split('|').forEach(function(p){var kv=p.split(':');if(kv[0] in o)o[kv[0]]=parseInt(kv[1],10)?1:0;});w={decided:true,functional:o.functional,analytics:o.analytics,marketing:o.marketing};}" +
  "else{var allow=r('cl_geo_default')==='allow';w={decided:false,functional:allow?1:0,analytics:allow?1:0,marketing:0};}" +
  "var gpc=(navigator.globalPrivacyControl===true)||(navigator.doNotTrack=='1')||(navigator.doNotTrack==='yes')||(window.doNotTrack=='1');" +
  "if(gpc){w.functional=0;w.analytics=0;w.marketing=0;}" +
  "window.__CL_CONSENT__=w;}catch(e){window.__CL_CONSENT__={decided:false,functional:0,analytics:0,marketing:0};}})();";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning because <html> is deliberately mutated before
    // hydration and React does not know about it. The hero's boot script stamps
    // ha-anim / ha-lock / ha-hero-top here in the HTML, ahead of the first paint,
    // which is the whole point of them: a class applied after hydration is a
    // frame of finished hero, or a scroll you can already have made. React's tree
    // carries no className for this element, so it reports the difference and, in
    // its own words, will not patch it up. Scoped to this element and one level of
    // its attributes, which is exactly the surface the script writes to.
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        {/* FIRST, and before the hero's own boot script, because that script
            decides in one pass whether to run the animatic and whether to hold
            the scroll, and it has to read a settled answer about motion. Puts
            back the `cl-force-motion` class for a session that already opted in.
            See src/lib/motion.ts. */}
        <script dangerouslySetInnerHTML={{ __html: FORCE_MOTION_BOOTSTRAP }} />
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
          <GoogleAnalytics />
        </ConsentProvider>
      </body>
    </html>
  );
}
