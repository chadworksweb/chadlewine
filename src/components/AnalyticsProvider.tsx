"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";

interface AnalyticsEvent {
  event_type: string;
  page_path: string;
  observation_id?: string | null;
  meditation_id?: string | null;
  metadata?: Record<string, unknown>;
  session_id: string;
  created_at: string;
}

const BATCH_INTERVAL = 10_000; // 10 seconds
const MAX_BATCH = 20;
const SKIP_KEY = "cl_skip_analytics";

function isSkipped(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SKIP_KEY) === "1";
  } catch {
    return false;
  }
}

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for non-secure contexts (e.g. dev over LAN HTTP on iOS Safari).
  const r = () => Math.floor(Math.random() * 0xffff).toString(16).padStart(4, "0");
  return `${r()}${r()}-${r()}-${r()}-${r()}-${r()}${r()}${r()}`;
}

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let sid = sessionStorage.getItem("cl_sid");
  if (!sid) {
    sid = randomId();
    sessionStorage.setItem("cl_sid", sid);
  }
  return sid;
}

function getEntityIds(): { observation_id?: string; meditation_id?: string } {
  if (typeof document === "undefined") return {};
  const el = document.querySelector("[data-observation-id]");
  if (el) return { observation_id: el.getAttribute("data-observation-id") || undefined };
  const mel = document.querySelector("[data-meditation-id]");
  if (mel) return { meditation_id: mel.getAttribute("data-meditation-id") || undefined };
  return {};
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const queueRef = useRef<AnalyticsEvent[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const maxScrollRef = useRef<number>(0);

  const flush = useCallback(async () => {
    if (queueRef.current.length === 0) return;
    const batch = queueRef.current.splice(0, MAX_BATCH);
    try {
      await fetch("/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: batch }),
        keepalive: true,
      });
    } catch {
      // Silent fail — analytics should never break the site
    }
  }, []);

  const track = useCallback(
    (eventType: string, metadata?: Record<string, unknown>) => {
      if (isSkipped()) return;
      const sessionId = getSessionId();
      if (!sessionId) return;
      const ids = getEntityIds();
      queueRef.current.push({
        event_type: eventType,
        page_path: pathname,
        ...ids,
        metadata: metadata || undefined,
        session_id: sessionId,
        created_at: new Date().toISOString(),
      });

      // Fan out to PostHog. Skip page_view because PostHog has its own $pageview.
      if (eventType !== "page_view" && typeof window !== "undefined") {
        const ph = (window as unknown as { posthog?: { __loaded?: boolean; capture: (e: string, p?: Record<string, unknown>) => void } }).posthog;
        if (ph?.__loaded) {
          ph.capture(eventType, { ...ids, ...(metadata || {}) });
        }
      }
    },
    [pathname]
  );

  // Page view on route change
  useEffect(() => {
    startTimeRef.current = Date.now();
    maxScrollRef.current = 0;
    track("page_view");

    return () => {
      // Send time_on_page + scroll depth on leave
      const duration = Math.round((Date.now() - startTimeRef.current) / 1000);
      if (duration > 1) {
        track("time_on_page", { duration_seconds: duration });
      }
      if (maxScrollRef.current > 0) {
        track("scroll_depth", { max_percent: maxScrollRef.current });
      }
      flush();
    };
  }, [pathname, track, flush]);

  // Scroll depth tracking
  useEffect(() => {
    function handleScroll() {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const pct = Math.round((scrollTop / docHeight) * 100);
      if (pct > maxScrollRef.current) maxScrollRef.current = pct;
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Batch flush interval
  useEffect(() => {
    timerRef.current = setInterval(flush, BATCH_INTERVAL);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      flush(); // Flush remaining on unmount
    };
  }, [flush]);

  // Flush on page hide (tab close, navigate away)
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") flush();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [flush]);

  // Expose track function globally for imperative calls (audio_play, merch_click, etc.)
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__clTrack = track;
    return () => { delete (window as unknown as Record<string, unknown>).__clTrack; };
  }, [track]);

  return <>{children}</>;
}

/** Call from any client component to track a custom event */
export function trackEvent(eventType: string, metadata?: Record<string, unknown>) {
  const fn = (window as unknown as Record<string, unknown>).__clTrack as
    | ((type: string, meta?: Record<string, unknown>) => void)
    | undefined;
  if (fn) fn(eventType, metadata);
}
