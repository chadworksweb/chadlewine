"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useCart } from "@/components/Cart";
import { SubscribeModal } from "@/components/SubscribeModal";

/* Decides WHETHER and WHEN to show the subscribe modal. Mounted by the public
   layout only when the feature is enabled and the visitor is not excluded
   (signed-in / admin / admin-IP gating happens server-side before mount).

   Triggers (first to fire wins):
     - exit-intent: mouse leaves toward the top of the viewport (desktop)
     - dwell: time on page (shortened once something is in the cart)
     - scroll depth: 60% of the page
     - mobile exit-ish: engaged (scrolled past 600px) then returned toward top

   Frequency:
     - once per browser session (sessionStorage)
     - dismissed -> silent for RESHOW_DAYS on this device (localStorage)
     - subscribed -> never again on this device
   Cart-add is a qualifier, not a trigger: it only shortens the dwell timer and
   keeps exit-intent armed. The cart drawer opens on its own; we never stack.

   Thresholds are admin-tunable (site_settings) and passed in as props; the
   defaults below are only a fallback if a prop is omitted. */

const DEFAULT_DWELL_SECONDS = 40;
const DEFAULT_CART_DWELL_SECONDS = 15;
const DEFAULT_SCROLL_DEPTH_PCT = 60;
const DEFAULT_RESHOW_DAYS = 14;

const STORAGE_KEY = "cl_submodal";
const SESSION_KEY = "cl_submodal_shown";

// Conversion / private pages where the modal must never appear.
const SUPPRESS_PREFIXES = [
  "/checkout",
  "/super-individual-night",
  "/account",
  "/preferences",
  "/unsubscribe",
];

type PersistedState = { subscribed?: boolean; dismissedAt?: number };

function readState(): PersistedState {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeState(patch: PersistedState) {
  try {
    const next = { ...readState(), ...patch };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable (private mode); fail open, no persistence */
  }
}

function isSuppressedPath(pathname: string): boolean {
  return SUPPRESS_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

interface Props {
  dwellSeconds?: number;
  cartDwellSeconds?: number;
  scrollDepthPct?: number;
  reshowDays?: number;
}

export function SubscribeModalController({
  dwellSeconds = DEFAULT_DWELL_SECONDS,
  cartDwellSeconds = DEFAULT_CART_DWELL_SECONDS,
  scrollDepthPct = DEFAULT_SCROLL_DEPTH_PCT,
  reshowDays = DEFAULT_RESHOW_DAYS,
}: Props) {
  const pathname = usePathname();
  const { count } = useCart();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (show) return; // already open this load
    if (isSuppressedPath(pathname)) return;

    const reshowMs = reshowDays * 24 * 60 * 60 * 1000;
    const scrollDepth = scrollDepthPct / 100;

    // Frequency / eligibility gates.
    const state = readState();
    if (state.subscribed) return;
    if (state.dismissedAt && Date.now() - state.dismissedAt < reshowMs) return;
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;

    let fired = false;
    let maxScroll = window.scrollY;

    function cleanup() {
      clearTimeout(dwellTimer);
      document.removeEventListener("mouseout", onMouseOut);
      window.removeEventListener("scroll", onScroll);
    }

    function trigger() {
      if (fired) return;
      fired = true;
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        /* ignore */
      }
      cleanup();
      setShow(true);
    }

    function onMouseOut(e: MouseEvent) {
      // Cursor left the document toward the top (tab/close/URL bar).
      if (e.clientY <= 0 && !e.relatedTarget) trigger();
    }

    function onScroll() {
      const y = window.scrollY;
      const docHeight = document.documentElement.scrollHeight;
      if (docHeight > 0 && (y + window.innerHeight) / docHeight >= scrollDepth) {
        trigger();
        return;
      }
      // Mobile/touch "leaving" gesture: was engaged, now racing back to top.
      if (y > maxScroll) maxScroll = y;
      if (maxScroll > 600 && y < 200) trigger();
    }

    const dwellMs = (count > 0 ? cartDwellSeconds : dwellSeconds) * 1000;
    const dwellTimer = setTimeout(trigger, dwellMs);
    document.addEventListener("mouseout", onMouseOut);
    window.addEventListener("scroll", onScroll, { passive: true });

    return cleanup;
  }, [
    pathname,
    count,
    show,
    dwellSeconds,
    cartDwellSeconds,
    scrollDepthPct,
    reshowDays,
  ]);

  const handleClose = useCallback(() => {
    writeState({ dismissedAt: Date.now() });
    setShow(false);
  }, []);

  const handleSubscribed = useCallback(() => {
    writeState({ subscribed: true });
  }, []);

  if (!show) return null;

  return (
    <SubscribeModal
      sourcePage={pathname}
      onClose={handleClose}
      onSubscribed={handleSubscribed}
    />
  );
}
