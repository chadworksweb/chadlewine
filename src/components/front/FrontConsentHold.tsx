"use client";

import { useEffect } from "react";

// Keeps the cookie bar off the front door's first paint.
//
// ConsentProvider already knows how to wait: the homepage holds the bar while
// the hero has the screen, because a bar fixed to the bottom of the viewport
// lands on top of whatever the hero puts there. The front page has the same
// collision and no hero to detect. Measured at 1600x1000 during the build, the
// bar covered the whole 84px of the CTA on a page with no scroll to reach past
// it; the frame scrolls now, but the first impression is still a table of six
// rows with a cookie bar across the bottom of it before anyone has read a word.
//
// So this stamps the class ConsentProvider watches, and then lifts it. WHAT
// LIFTS IT MATTERS MORE THAN THE HOLD: geo defaults are deny in the EU, the UK,
// the EEA, Switzerland and California, and the bar is the only way a visitor
// there can say yes. A hold with no release would quietly deny them.
//
// Two releases, whichever comes first:
//
//   the first real interaction -- a press, a key, a wheel, a touch drag, a
//   scroll. Someone who has opened a panel is in the page rather than looking
//   at it, which is the same moment the homepage picks.
//
//   a timer, for the visitor who reads the door and does nothing. Without it
//   the question is never asked at all.
//
// The class is written to <html> rather than held in state because that is
// where ConsentProvider reads it from, through a MutationObserver: a class
// nothing in React owns is an external store, and this keeps it that way.
const HOLD_CLASS = "cl-consent-hold";

// Long enough to read the six labels, short enough that nobody wonders whether
// the site is going to ask. The homepage's equivalent is a scroll past the
// hero, which lands in the same few seconds.
const RELEASE_MS = 6500;

const RELEASE_EVENTS = [
  "pointerdown",
  "keydown",
  "wheel",
  "touchmove",
  "scroll",
] as const;

export function FrontConsentHold() {
  useEffect(() => {
    const root = document.documentElement;

    // Nothing to hold if the visitor has already answered: re-adding the class
    // for a decided visitor would be a wait with no bar at the end of it, and
    // the MutationObserver in ConsentProvider would fire for nothing.
    const decided = !!window.__CL_CONSENT__?.decided;
    if (decided) return;

    root.classList.add(HOLD_CLASS);

    let done = false;
    const release = () => {
      if (done) return;
      done = true;
      root.classList.remove(HOLD_CLASS);
      window.clearTimeout(timer);
      for (const type of RELEASE_EVENTS) {
        window.removeEventListener(type, release);
      }
    };

    const timer = window.setTimeout(release, RELEASE_MS);
    for (const type of RELEASE_EVENTS) {
      // passive: these only ever remove a class, and a non-passive scroll or
      // touch listener on the document is a scrolling jank hazard for nothing.
      window.addEventListener(type, release, { passive: true });
    }

    // Unmount releases too. The CTA leaves this page by hard navigation so the
    // class dies with the document either way, but a client-side route change
    // would otherwise carry the hold onto a page that never asked for it.
    return release;
  }, []);

  return null;
}
