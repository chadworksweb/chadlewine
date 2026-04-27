import type { Metadata } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "@/styles/global.css";
import { SiteJsonLd } from "@/components/SiteJsonLd";
import { CartProvider, CartUI } from "@/components/Cart";
import { PlayerProvider } from "@/components/PlayerContext";
import { StickyPlayer } from "@/components/StickyPlayer";

const GA_ID = "G-9EE3EK7X3R";

export const metadata: Metadata = {
  metadataBase: new URL("https://chadlewine.com"),
  title: {
    default: "Chad Lewine",
    template: "%s — Chad Lewine",
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SiteJsonLd />
        <CartProvider>
          <PlayerProvider>
            {children}
            <StickyPlayer />
          </PlayerProvider>
          <CartUI />
        </CartProvider>
        <Analytics />
        <SpeedInsights />
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}
        </Script>
      </body>
    </html>
  );
}
