"use client";

// THE INVITE. Shown once per session to a visitor whose OS asks for reduced
// motion, and only on the homepage, because the homepage is the only place with
// anything to offer them: the animatic is the first thing here, and a stated
// motion preference correctly turns it off.
//
// The card itself never animates. It would be a strange thing to ask someone
// about their motion preference by ignoring it, and it is also the reason there
// is no fade-in here and no transition on the buttons.
//
// PLAY THE INTRO forces motion for the session and reloads, because the hero
// decides whether to run before the first paint and cannot be talked round
// afterwards (see enableForcedMotion). KEEP IT STILL dismisses and leaves the
// preference exactly as the visitor set it.

import { useEffect, useRef, useState } from "react";
import { isReducedMotionUnforced, enableForcedMotion } from "@/lib/motion";
import "./MotionInvite.css";

const SEEN_KEY = "cl-motion-invite";

export function MotionInvite() {
  const [open, setOpen] = useState(false);
  const goRef = useRef<HTMLButtonElement>(null);

  // In an effect, not during render: the server cannot know either the media
  // query or sessionStorage, so this has to be a client-only decision made after
  // hydration. Rendering nothing on both passes is what keeps it out of the
  // hydration diff entirely.
  useEffect(() => {
    if (!isReducedMotionUnforced()) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* storage unavailable; ask once this load rather than never */
    }
    if (!seen) setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    goRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function dismiss() {
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      className="cl-motion-invite"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cl-motion-invite-title"
    >
      <div className="cl-motion-invite__card">
        {/* chadworks' wording, carried over as-is. The only clause that moves is
            the one naming what the site is FOR, because that sentence is the
            only part of it that was about chadworks rather than about motion. */}
        <h2 id="cl-motion-invite-title" className="cl-motion-invite__title">
          You have reduced motion turned on
        </h2>
        <p className="cl-motion-invite__body">
          The chadlewine.com website was designed to showcase original music, art
          and thoughts through ambient and gentle motion, but we respect your
          device&apos;s &ldquo;reduce motion&rdquo; settings. I encourage you to
          click the button below to see the site in its intended state.
        </p>
        <div className="cl-motion-invite__actions">
          <button
            ref={goRef}
            type="button"
            className="cl-motion-invite__btn cl-motion-invite__btn--go"
            onClick={enableForcedMotion}
          >
            VIEW MOTION
          </button>
          <button
            type="button"
            className="cl-motion-invite__btn cl-motion-invite__btn--stay"
            onClick={dismiss}
          >
            KEEP MOTION OFF
          </button>
        </div>
      </div>
    </div>
  );
}
