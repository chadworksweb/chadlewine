"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { analyticsAllowed } from "@/lib/consent";

const GA_ID = "G-9EE3EK7X3R";

// Paths that must never be tracked in GA (admin app + secret admin door).
const ADMIN_PREFIXES = ["/admin", "/cl-admin-6nnn"];

function isAdminPath(pathname: string): boolean {
  return ADMIN_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

type GtagWindow = Window & {
  gtag?: (...args: unknown[]) => void;
  [key: `ga-disable-${string}`]: boolean | undefined;
};

export function GoogleAnalytics() {
  const pathname = usePathname();
  // Once the gtag script is injected it stays mounted for the session.
  // Unmounting the <Script> tag does NOT unload the already-executed gtag
  // library, so we never relied on that for admin exclusion -- see below.
  const [loadScript, setLoadScript] = useState(false);
  // The first allowed page_view comes from gtag('config') on script load.
  // Skip the manual send on that first render so it is not counted twice.
  const initialized = useRef(false);

  // Per-navigation gate. Unmounting <Script> cannot stop an already-loaded
  // gtag, so admin exclusion now works two ways that DO survive load:
  //   1. window['ga-disable-<ID>'] -- gtag's documented kill switch, honored
  //      on every hit, so nothing is sent while on an admin path.
  //   2. We send page_view manually on each client navigation (GA4 enhanced
  //      measurement "page changes based on browser history events" must be
  //      OFF, or public SPA views double-count). We simply never send on an
  //      admin path, so SPA navigations into /admin emit no hit.
  useEffect(() => {
    const ok = analyticsAllowed() && !isAdminPath(pathname);
    const w = window as unknown as GtagWindow;
    w[`ga-disable-${GA_ID}`] = !ok;
    if (!ok) return;

    setLoadScript(true);

    // First allowed render: gtag('config') sends the initial page_view itself.
    if (!initialized.current) {
      initialized.current = true;
      return;
    }
    if (typeof w.gtag === "function") {
      w.gtag("event", "page_view", {
        page_location: window.location.href,
        page_title: document.title,
      });
    }
  }, [pathname]);

  if (!loadScript) return null;

  return (
    <>
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
    </>
  );
}
