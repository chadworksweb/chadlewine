"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";
import { analyticsAllowed, subscribeConsent } from "@/lib/consent";

const SKIP_KEY = "cl_skip_analytics";

function applyUrlParamOverride() {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    const param = url.searchParams.get("skip-analytics");
    if (param === "1") localStorage.setItem(SKIP_KEY, "1");
    else if (param === "0") localStorage.removeItem(SKIP_KEY);
  } catch {}
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  // Skip-analytics flag management — runs on every environment so it works on
  // local, staging, and prod. PostHog init itself is still prod-only below.
  useEffect(() => {
    if (typeof window === "undefined") return;
    applyUrlParamOverride();
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.user?.role === "admin") {
          try { localStorage.setItem(SKIP_KEY, "1"); } catch {}
          try { posthog.opt_out_capturing(); } catch {}
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;

    const host = window.location.hostname;
    const isProd = host === "chadlewine.com" || host === "www.chadlewine.com";
    if (!isProd) return;

    // Gate on consent (+ admin opt-out): analyticsAllowed() is false when the
    // visitor hasn't granted analytics consent OR this is an admin/test browser.
    const skip = !analyticsAllowed();

    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      // First-party reverse proxy (ad-blocker resistant). /ingest/* is
      // rewritten to PostHog in next.config; ui_host points the toolbar/links
      // at the real app.
      api_host: "/ingest",
      ui_host: "https://us.posthog.com",
      respect_dnt: true,
      person_profiles: "identified_only",
      capture_pageview: true,
      capture_pageleave: true,
      autocapture: true,
      opt_out_capturing_by_default: skip,
    });

    if (skip) {
      try { posthog.opt_out_capturing(); } catch {}
    }

    posthog.register({
      env: "production",
      site: "chadlewine.com",
    });

    if (sessionStorage.getItem("cl_posthog_reset") === "1") {
      posthog.reset();
      sessionStorage.removeItem("cl_posthog_reset");
    }

    // Identify only non-admin users. Admin identification happens above and
    // triggers opt-out instead.
    if (analyticsAllowed()) {
      fetch("/api/auth/me", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.user?.id && data?.user?.role !== "admin" && analyticsAllowed()) {
            posthog.identify(data.user.id, {
              email: data.user.email,
              role: data.user.role,
            });
          }
        })
        .catch(() => {});
    }
  }, []);

  // Consent can change after init, and init only reads it once. PostHog is
  // already loaded by then and merely opted out, so both directions are a flag
  // it supports flipping in place: no reload, and nothing to unload. Guarded on
  // __loaded because init is skipped entirely off production, where opting a
  // client that was never initialised in or out is meaningless.
  useEffect(
    () =>
      subscribeConsent(() => {
        if (!(posthog as unknown as { __loaded?: boolean }).__loaded) return;
        try {
          if (analyticsAllowed()) posthog.opt_in_capturing();
          else posthog.opt_out_capturing();
        } catch {}
      }),
    [],
  );

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
