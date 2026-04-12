import type { Metadata } from "next";
import "@/styles/global.css";
import { SiteJsonLd } from "@/components/SiteJsonLd";

export const metadata: Metadata = {
  metadataBase: new URL("https://chadlewine.com"),
  title: {
    default: "Chad Lewine",
    template: "%s — Chad Lewine",
  },
  description:
    "Cross-domain observations that connect the invisible patterns between music, money, faith, identity, consciousness, and everything else.",
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
        {children}
      </body>
    </html>
  );
}
