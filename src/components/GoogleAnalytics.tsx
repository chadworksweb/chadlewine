"use client";

import { useEffect, useState } from "react";
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

export function GoogleAnalytics() {
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);

  // Gate on analytics consent (analyticsAllowed() also covers the admin/test
  // opt-out), plus admin paths. Resolve after mount since window.__CL_CONSENT__
  // and localStorage are client-only; starting false keeps SSR/first paint
  // script-free until consent is confirmed, and re-checking on pathname keeps
  // admin routes excluded.
  useEffect(() => {
    setAllowed(analyticsAllowed() && !isAdminPath(pathname));
  }, [pathname]);

  if (!allowed) return null;

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
