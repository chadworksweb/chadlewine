"use client";

// The front page's light/dark switch, built on Offplat's pattern.
//
// WHY IT RENDERS NO STATE. The server cannot know which theme a reader is on, so
// any glyph chosen in JS either mismatches at hydration or flashes the wrong
// one first. Both marks are rendered every time and front.css shows exactly one,
// keyed off the same two states the palette uses. The component holds no state,
// so there is nothing to hydrate wrong.
//
// The marks are the site's own block glyphs rather than a sun and a moon: the
// wordmark is framed in them everywhere else, and a stock weather icon would be
// the one piece of borrowed vocabulary on the page.

const KEY = "cl-front-theme";
const ATTR = "data-front-theme";

// How long the crossfade class stays on <html>. Must outlast --f-theme (300ms)
// or the transition is cut off mid-fade; the 60ms of slack costs nothing
// because the class does nothing once the colours have settled.
const CROSSFADE_MS = 360;
const CROSSFADE_CLASS = "front-theming";

// Module scope rather than a ref, because this component deliberately holds no
// state (see above) and one timer for one button on one page is not worth
// making it stateful.
let crossfadeTimer = 0;

export function FrontThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    // No attribute means DARK, full stop. This page does not consult
    // prefers-color-scheme: chadlewine.com is a dark site and the front page
    // opens the way the rest of it looks, so an unstamped document is already
    // dark and the only place to go from here is light.
    const current = root.getAttribute(ATTR) || "dark";
    const next = current === "dark" ? "light" : "dark";

    // Arm the crossfade BEFORE the attribute flips, so the new colours are
    // already transitioning rather than being painted and then eased. See the
    // .front-theming block in global.css for why this is a temporary class and
    // not a standing rule.
    //
    // Skipped outright for a reader who asked for reduced motion: for them the
    // honest answer to "change the theme" is that it is already changed.
    const wantsMotion = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (wantsMotion) {
      root.classList.add(CROSSFADE_CLASS);
      // A single timer, restarted on every press. Without clearing the last
      // one, a double tap would have the first timeout strip the class while
      // the second switch was still fading.
      window.clearTimeout(crossfadeTimer);
      crossfadeTimer = window.setTimeout(() => {
        root.classList.remove(CROSSFADE_CLASS);
      }, CROSSFADE_MS);
    }

    root.setAttribute(ATTR, next);
    // Private browsing and blocked storage both throw here. The theme still
    // switches; it just will not survive a reload.
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable; the choice is good for this page view */
    }
  }

  return (
    <button
      type="button"
      className="front__theme"
      onClick={toggle}
      aria-label="Toggle light and dark"
      title="Toggle light and dark"
    >
      {/* Offplat's own two marks, geometry unchanged. They are drawn on
          currentColor, so the accent swap between themes is a CSS concern and
          this component never picks a colour. */}

      {/* Shown on the DARK ground, which is the default: press for light. */}
      <svg
        className="front__theme-mark front__theme-mark--light"
        viewBox="0 0 24 24"
        width="17"
        height="17"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4 17 7M7 17l-1.6 1.6" />
      </svg>

      {/* Shown once the reader has chosen light: press for dark. */}
      <svg
        className="front__theme-mark front__theme-mark--dark"
        viewBox="0 0 24 24"
        width="17"
        height="17"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />
      </svg>
    </button>
  );
}
