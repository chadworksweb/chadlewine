"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useCart } from "@/components/Cart";
import { SubscribeModal } from "@/components/SubscribeModal";

/* Decides WHETHER and WHEN to show the subscribe modal. Mounted by the public
   layout only when the feature is enabled and the visitor is not excluded
   (signed-in / admin / admin-IP gating happens server-side before mount).

   TWO PREREQUISITES, and neither is a trigger. Nothing below is even armed
   until both hold:
     - the hero animatic has settled (homepage only; see heroSettled)
     - the visitor has actually scrolled (see hasScrolled)
   Everything after this is about WHICH moment to choose, once there is a
   visitor who has seen the page and chosen to keep going.

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

const DEFAULT_DWELL_SECONDS = 48;
const DEFAULT_CART_DWELL_SECONDS = 18;
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
  "/subscribe",
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
  const [eligible, setEligible] = useState(false);
  // THE ANIMATIC IS NOT AN INTERRUPTIBLE MOMENT. The homepage opens on a held
  // beat with a scroll lock over it, and a modal that lands during it does not
  // interrupt the page, it interrupts the one thing the visitor arrived on.
  // Exit-intent is the real offender: it arms three seconds in, so a cursor
  // drifting toward the tab bar four seconds into a thirteen second intro used
  // to cover it. Dwell can reach it too whenever an admin tunes it under the
  // intro's length.
  //
  // Starts false and is corrected on mount, which also means the dwell timer
  // below starts counting when the animatic ENDS rather than when the document
  // did. Time on the page should mean time on the PAGE, not time spent watching
  // an intro that holds the scroll.
  const [heroSettled, setHeroSettled] = useState(false);
  useEffect(() => {
    const d = document.documentElement;
    // `ha-anim` says an animatic is going to run on this document, and the hero
    // removes it outright when there is no usable WebGL. `ha-lite` never adds
    // it. `ha-done` says one has already settled, which is also what a visitor
    // who clicked through to a second page carries with them.
    const waiting =
      d.classList.contains("ha-anim") &&
      !d.classList.contains("ha-done") &&
      // Navigated away mid-intro: the class is still on the document but the
      // scene that would clear it has unmounted, so nothing is coming.
      !!document.querySelector(".ha-stage");
    if (!waiting) {
      setHeroSettled(true);
      return;
    }
    const onDone = () => setHeroSettled(true);
    window.addEventListener("hero:done", onDone);
    return () => window.removeEventListener("hero:done", onDone);
  }, [pathname]);

  // NOTHING FIRES UNTIL THE VISITOR HAS SCROLLED. Not the dwell timer, not
  // exit-intent, not any of it.
  //
  // Someone who has not scrolled has not decided anything yet: they are reading
  // the first screen, or they have just arrived and are still working out what
  // this is. A modal at that moment is not an offer, it is an obstacle in front
  // of a page nobody has seen. A scroll is the smallest honest signal that they
  // chose to keep going.
  //
  // It also means the dwell timer starts from the scroll rather than from the
  // page, so "48 seconds" is 48 seconds of someone actually moving through the
  // site, not 48 seconds of a tab left open on the hero.
  //
  // The threshold exists because a trackpad resting under a palm, a phone
  // settling after a tap, and the browser's own scroll restoration all produce a
  // pixel or two. Those are not decisions.
  const [hasScrolled, setHasScrolled] = useState(false);
  useEffect(() => {
    if (hasScrolled) return;
    const start = window.scrollY;
    const onScroll = () => {
      if (Math.abs(window.scrollY - start) < 24) return;
      setHasScrolled(true);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [hasScrolled]);

  // The (public) layout used to decide server-side whether to mount this at all
  // (session / admin / admin-IP gating). It now always mounts it -- so public
  // pages stay statically cacheable -- and eligibility is resolved here, from a
  // dynamic API that runs the identical check.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/subscribe-modal/eligible")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setEligible(!!d?.eligible);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (show) return; // already open this load
    if (!eligible) return; // server-side gate (session/admin/IP) not satisfied
    if (!heroSettled) return; // the hero animatic still owns the screen
    if (!hasScrolled) return; // nobody has chosen to go past the first screen yet
    if (isSuppressedPath(pathname)) return;

    const reshowMs = reshowDays * 24 * 60 * 60 * 1000;
    const scrollDepth = scrollDepthPct / 100;

    // Frequency / eligibility gates.
    const state = readState();
    if (state.subscribed) return;
    if (state.dismissedAt && Date.now() - state.dismissedAt < reshowMs) return;
    if (sessionStorage.getItem(SESSION_KEY) === "1") return;

    let fired = false;
    let armed = false;
    let maxScroll = window.scrollY;

    function cleanup() {
      clearTimeout(dwellTimer);
      clearTimeout(armTimer);
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
      // Mobile/touch "leaving" gesture: deeply engaged, now racing back to the
      // very top. Gated behind the settle delay and tightened (deeper scroll,
      // closer return) so re-reading the top of a page doesn't trip it.
      if (y > maxScroll) maxScroll = y;
      if (armed && maxScroll > 1000 && y < 80) trigger();
    }

    const dwellMs = (count > 0 ? cartDwellSeconds : dwellSeconds) * 1000;
    const dwellTimer = setTimeout(trigger, dwellMs);
    // Arm exit detection only after a short settle delay -- otherwise the cursor
    // drifting toward the tab/URL bar (desktop) or an early scroll bounce
    // (mobile) fires it before the visitor has engaged.
    const armTimer = setTimeout(() => {
      armed = true;
      document.addEventListener("mouseout", onMouseOut);
    }, 3000);
    window.addEventListener("scroll", onScroll, { passive: true });

    return cleanup;
  }, [
    pathname,
    count,
    show,
    eligible,
    heroSettled,
    hasScrolled,
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
