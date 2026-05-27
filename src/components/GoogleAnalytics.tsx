"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";

const GA_ID = "G-9EE3EK7X3R";

// Paths that must never be tracked in GA (admin app + secret admin door).
const ADMIN_PREFIXES = ["/admin", "/cl-admin-6nnn"];

function isAdminPath(pathname: string): boolean {
  return ADMIN_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

// Shared opt-out with first-party analytics: set localStorage.cl_skip_analytics
// to "1" on the admin's own machines to mute all GA hits from that browser.
function isSkipped(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("cl_skip_analytics") === "1";
  } catch {
    return false;
  }
}

export function GoogleAnalytics() {
  const pathname = usePathname();
  const [skipDevice, setSkipDevice] = useState(false);

  // localStorage is client-only; resolve it after mount to avoid hydration drift.
  useEffect(() => {
    setSkipDevice(isSkipped());
  }, []);

  if (skipDevice || isAdminPath(pathname)) return null;

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
