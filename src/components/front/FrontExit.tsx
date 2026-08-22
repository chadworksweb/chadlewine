"use client";

import { useCallback, useRef } from "react";

// The VIEW FULL SITE button, and the exit it plays before handing over.
//
// WHY THIS IS A HARD NAVIGATION, still. The hero animatic writes ha-anim and
// ha-lock onto <html> from an inline script BEFORE first paint, and when that
// class is absent the settled end-of-intro hero is what paints. A client-side
// navigation never runs that script: measured, / arrived carrying ha-hero-top
// alone, the menu scene painted, and an effect snapped the scene back to frame
// one about 300ms later. So this stays a real document load and the exit is
// played first, by hand, before the location changes.
//
// THE HANDOVER. Nothing here can reveal the animatic, because the animatic is
// on the page we have not loaded yet. What it does instead is end on the same
// colour that page begins on: the panels wipe left in sequence, the chrome and
// the artwork behind it fade out, and a brand-black veil closes over the last
// 240ms. The new document then paints its intro on black, so the seam between
// the two has nothing in it to see.
//
// It also means the black is doing real work rather than being decorative: a
// full page load has an unavoidable gap between "old document goes away" and
// "new document paints", and both sides of that gap are now the same colour.

const EXIT_MS = 980;

export function FrontExit({ href, children }: { href: string; children: React.ReactNode }) {
  // Guards a second click while the exit is already running. A ref rather than
  // state because nothing about it should cause a render; re-rendering the
  // button mid-animation is how you get a flash of the un-exited page.
  const leaving = useRef(false);

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      // Leave modified clicks entirely alone: ctrl/cmd-click, middle-click and
      // shift-click are all requests for a new tab or window, and a new tab has
      // no use for an exit animation played in this one.
      if (
        e.defaultPrevented ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        e.button !== 0
      ) {
        return;
      }

      e.preventDefault();
      if (leaving.current) return;
      leaving.current = true;

      const root = document.querySelector(".front");

      // NO REDUCED-MOTION GATE. This used to read
      // prefers-reduced-motion and navigate straight through, skipping the
      // wipe, which is the ordinary right answer and is what the rest of the
      // site still does. The front page deliberately does not honour the
      // preference (Chad, 2026-08-20; see the Motion section in global.css for
      // the reasoning and the cost), and a wipe that played for everyone
      // except the person who asked for less motion would leave this button
      // behaving differently from every other moving part on the page.
      //
      // The `root` check stays: with no .front element there is nothing to add
      // the class to and nothing to animate, so the navigation is all there is.
      if (!root) {
        window.location.href = href;
        return;
      }

      root.classList.add("front--exiting");

      // A timer, not a transitionend listener. Several elements animate here on
      // different delays, so transitionend fires many times and the LAST one is
      // what matters -- and if any of them is interrupted or never starts (a
      // background-tab throttle is enough) that event never arrives and the
      // button silently stops working. A timer cannot fail to fire.
      window.setTimeout(() => {
        window.location.href = href;
      }, EXIT_MS);
    },
    [href]
  );

  // Warms the target on intent rather than on click, so the document is on its
  // way while the exit plays and the gap after it is as short as the network
  // allows. prefetch is a hint; if it is ignored nothing breaks.
  const warm = useCallback(() => {
    if (document.querySelector('link[data-front-warm]')) return;
    const l = document.createElement("link");
    l.rel = "prefetch";
    l.as = "document";
    l.href = href;
    l.setAttribute("data-front-warm", "");
    document.head.appendChild(l);
  }, [href]);

  return (
    <a
      className="front__cta"
      href={href}
      onClick={onClick}
      onPointerEnter={warm}
      onFocus={warm}
      // RouteProgress watches every same-origin anchor click from the capture
      // phase and cannot see that this one is going to sit on an exit
      // animation first, so it started its bar the moment the button was
      // pressed and then held it there for the length of the wipe. The bar
      // exists because the browser's own tab spinner never fires on in-site
      // navigation; here it does fire, because this is a real document load,
      // so the bar is both wrong and redundant. The component ships this
      // opt-out for exactly this case.
      data-no-progress=""
    >
      {children}
    </a>
  );
}
