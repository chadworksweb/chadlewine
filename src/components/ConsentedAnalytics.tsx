"use client";

import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { useEffect, useState } from "react";
import { analyticsAllowed } from "@/lib/consent";

/* Vercel Web Analytics + Speed Insights, gated behind analytics consent so a
   visitor who declines gets nothing fired (even though these are cookieless).
   analyticsAllowed() reads the consent bootstrap + admin opt-out; starting
   false keeps SSR/first paint script-free until consent is confirmed. If you
   ever want Speed Insights (performance monitoring) to run regardless of
   consent, render it outside this gate. */
export function ConsentedAnalytics() {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    setAllowed(analyticsAllowed());
  }, []);

  if (!allowed) return null;

  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
