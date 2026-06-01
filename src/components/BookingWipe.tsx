"use client";

import { useEffect, useRef, useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";

// Pillar-wipe page transition for the booking overview <-> inquiry states.
// A fluted-column panel (the colonnade's visual language, pure CSS) sweeps the
// screen top -> bottom to cover, navigates while fully covered, then keeps
// sweeping down to reveal the new state -- with the new content already in the
// DOM behind it, so the second sweep uncovers it instead of it popping in late.
//
// The reveal is gated on the DOM actually reflecting the destination, not on
// router/transition timing (which can report "done" before the RSC content
// swaps in). The page wrapper carries `page-booking--inquiry` only in the
// inquiry state, so we hold the cover and poll until that class matches the
// state we are navigating to -- a true "new content is mounted" signal.
//
// WipeLink fires a window event instead of navigating itself, so it never
// races next/link's own click handler. BookingWipeTransition lives once at the
// page root (rendered in BOTH states) so its state survives the soft nav.

const WIPE_EVENT = "booking:wipe";

// Full-block glyph (U+2588) -- the same character the intro's act cards use.
const BLOCK = String.fromCharCode(0x2588);

interface WipeLinkProps {
  href: string;
  className?: string;
  children: React.ReactNode;
}

export function WipeLink({ href, className, children }: WipeLinkProps) {
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        // Let the browser handle modified clicks (new tab, etc.).
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        window.dispatchEvent(new CustomEvent(WIPE_EVENT, { detail: { href } }));
      }}
    >
      {children}
    </a>
  );
}

type Phase = "idle" | "covering" | "navigating" | "revealing";

export function BookingWipeTransition() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [phase, setPhase] = useState<Phase>("idle");
  const targetRef = useRef<string | null>(null);
  const reducedRef = useRef(false);

  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Listen for wipe requests from WipeLink.
  useEffect(() => {
    function onWipe(e: Event) {
      const href = (e as CustomEvent<{ href: string }>).detail?.href;
      if (!href) return;
      if (reducedRef.current) {
        router.push(href);
        return;
      }
      targetRef.current = href;
      setPhase("covering");
    }
    window.addEventListener(WIPE_EVENT, onWipe);
    return () => window.removeEventListener(WIPE_EVENT, onWipe);
  }, [router]);

  // Screen is fully covered -> kick off the navigation. Stay covered.
  const onCoverEnd = useCallback(() => {
    const t = targetRef.current;
    setPhase("navigating");
    if (t) startTransition(() => router.push(t));
  }, [router, startTransition]);

  // Hold the cover until the DOM actually reflects the destination state, then
  // reveal. Polling the wrapper class is the reliable "content is mounted"
  // signal -- transition/URL state can flip before the swap is in the DOM.
  useEffect(() => {
    if (phase !== "navigating") return;
    const target = targetRef.current || "";
    const expectInquiry = /[?&]booking\b/.test(target);

    let raf = 0;
    let painted = 0;
    const check = () => {
      const el = document.getElementById("page-booking");
      const matches = !!el && el.classList.contains("page-booking--inquiry") === expectInquiry;
      // Require two settled frames so the committed content has painted before
      // the cover starts sliding away.
      if (matches) {
        painted += 1;
        if (painted >= 2) {
          setPhase("revealing");
          return;
        }
      } else {
        painted = 0;
      }
      raf = requestAnimationFrame(check);
    };
    raf = requestAnimationFrame(check);

    // Safety net: never strand the cover if the class never settles.
    const safety = setTimeout(() => setPhase((p) => (p === "navigating" ? "revealing" : p)), 2500);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(safety);
    };
  }, [phase]);

  const onRevealEnd = useCallback(() => {
    setPhase((p) => (p === "revealing" ? "idle" : p));
    targetRef.current = null;
  }, []);

  if (phase === "idle") return null;

  const modifier =
    phase === "covering" ? "bw-overlay--covering"
    : phase === "revealing" ? "bw-overlay--revealing"
    : "bw-overlay--full";

  return (
    <div
      className={`bw-overlay ${modifier}`}
      aria-hidden="true"
      onAnimationEnd={
        phase === "covering" ? onCoverEnd : phase === "revealing" ? onRevealEnd : undefined
      }
    >
      <div className="bw-overlay__flutes" />
      <div className="bw-overlay__scan" />
      <div className="bw-overlay__seam" />
      {phase === "navigating" && (
        <div className="bw-overlay__loader" aria-hidden="true">
          {[0, 120, 240, 360].map((d) => (
            <span key={d} style={{ animationDelay: `${d}ms` }}>{BLOCK}</span>
          ))}
        </div>
      )}
    </div>
  );
}
