"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;

    const host = window.location.hostname;
    const isProd = host === "chadlewine.com" || host === "www.chadlewine.com";
    if (!isProd) return;

    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: true,
    });

    posthog.register({
      env: "production",
      site: "chadlewine.com",
    });

    if (sessionStorage.getItem("cl_posthog_reset") === "1") {
      posthog.reset();
      sessionStorage.removeItem("cl_posthog_reset");
    }

    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user?.id) {
          posthog.identify(data.user.id, {
            email: data.user.email,
            role: "admin",
          });
        }
      })
      .catch(() => {});
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
