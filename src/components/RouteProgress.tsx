"use client";

// The browser's tab spinner never fires on this site. Every in-site click is
// an App Router client-side navigation -- a fetch and a DOM swap, not a
// document load -- so the browser never enters a loading state and the tab
// sits still while the page changes underneath it. This is the substitute.
//
// The App Router publishes no router events, so the start of a navigation is
// detected the only way available from outside a Link: a capture-phase click
// on any same-origin anchor. Completion is the pathname changing.
//
// It deliberately waits SHOW_DELAY_MS before painting. Most navigations here
// are prefetched and land in well under that, and a bar that flashes on every
// instant click is worse than no bar -- it makes a fast site look busy. The
// bar only appears for the navigations that actually make you wait, which is
// the complaint it exists to answer.

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import "./RouteProgress.css";

/** Nothing paints before this. Instant navigations finish inside it. */
const SHOW_DELAY_MS = 140;
/** A navigation that never completes still has to let go of the bar. */
const MAX_MS = 10000;
/** How long the finished bar stays at 100% before fading out. */
const DONE_MS = 240;

type Phase = "idle" | "loading" | "done";

function isPlainLeftClick(e: MouseEvent): boolean {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

export function RouteProgress() {
  const pathname = usePathname();
  const [phase, setPhase] = useState<Phase>("idle");
  const showTimer = useRef<number | null>(null);
  const maxTimer = useRef<number | null>(null);
  const doneTimer = useRef<number | null>(null);
  // The path the click was heading for. A navigation to where you already are
  // completes with no pathname change, so it would otherwise hang the bar.
  const pendingPath = useRef<string | null>(null);

  const clearTimers = useCallback(() => {
    for (const t of [showTimer, maxTimer, doneTimer]) {
      if (t.current !== null) {
        window.clearTimeout(t.current);
        t.current = null;
      }
    }
  }, []);

  const finish = useCallback(() => {
    clearTimers();
    pendingPath.current = null;
    setPhase((p) => {
      if (p === "idle") return "idle";
      doneTimer.current = window.setTimeout(() => setPhase("idle"), DONE_MS);
      return "done";
    });
  }, [clearTimers]);

  const start = useCallback(
    (target: string) => {
      clearTimers();
      pendingPath.current = target;
      showTimer.current = window.setTimeout(() => setPhase("loading"), SHOW_DELAY_MS);
      maxTimer.current = window.setTimeout(finish, MAX_MS);
    },
    [clearTimers, finish],
  );

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || !isPlainLeftClick(e)) return;
      const anchor = (e.target as Element | null)?.closest?.("a[href]") as
        | HTMLAnchorElement
        | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      if (anchor.dataset.noProgress !== undefined) return;

      const href = anchor.getAttribute("href") || "";
      if (href.startsWith("#") || /^[a-z]+:/i.test(href.split("/")[0])) {
        // Anchors and mailto:/tel: never navigate the router.
        if (!href.startsWith("/")) return;
      }

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      // Same page, or a jump within it: no navigation to wait on.
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;

      start(url.pathname);
    };

    // Capture, so it runs before Link's own handler and before anything that
    // stops propagation on the way up.
    document.addEventListener("click", onClick, { capture: true });
    // Back/forward is a navigation the click listener can't see.
    const onPopState = () => start(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("popstate", onPopState);
    };
  }, [start]);

  // The pathname landing IS the completion signal.
  useEffect(() => {
    if (pendingPath.current === null) return;
    finish();
    // pathname is the trigger; finish is stable.
  }, [pathname, finish]);

  useEffect(() => clearTimers, [clearTimers]);

  if (phase === "idle") return null;

  return (
    <div
      className={`route-progress route-progress--${phase}`}
      role="progressbar"
      aria-label="Loading page"
      aria-busy={phase === "loading"}
    >
      <div className="route-progress__bar" />
    </div>
  );
}
