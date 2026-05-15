"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";

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

function isSkipped(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
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

    const skip = isSkipped();

    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
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
    if (!isSkipped()) {
      fetch("/api/auth/me", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.user?.id && data?.user?.role !== "admin" && !isSkipped()) {
            posthog.identify(data.user.id, {
              email: data.user.email,
              role: data.user.role,
            });
          }
        })
        .catch(() => {});
    }
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
