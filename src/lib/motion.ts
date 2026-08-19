// FORCED MOTION: the reduced-motion override.
//
// A visitor whose OS asks for reduced motion gets the settled homepage by
// default. The hero freezes on the rested menu, the animatic never runs, and
// that is the correct thing to do with a stated accessibility preference.
//
// It is also, for this site specifically, most of what the homepage IS. So the
// invite (see MotionInvite) offers a one-time, per-session opt-in, and this is
// the switch it throws. Modelled on the same mechanism in chadworks.
//
// The override lives in TWO places on purpose:
//   - sessionStorage, so it survives the reload below and the rest of the visit
//   - a class on <html>, so CSS and pre-paint scripts can read it synchronously
// The class is the one every consumer should read. sessionStorage is only how it
// is remembered; a boot script in the root layout re-stamps the class from it
// before the first paint.
//
// Session-scoped rather than persistent, deliberately. Someone who turns their
// OS preference on has a reason for it, and a choice made once on one visit
// should not quietly override that setting forever.
const FORCE_KEY = "cl-force-motion";
const FORCE_CLASS = "cl-force-motion";
const REDUCE_MOTION = "(prefers-reduced-motion: reduce)";

// Re-stamps the class from sessionStorage. Inlined into the root layout and run
// before the first paint, so the hero's own boot script (which decides the
// scroll lock and the animatic in the same breath) reads a settled answer.
// Kept as a string here so the layout and this module cannot drift apart.
export const FORCE_MOTION_BOOTSTRAP =
  `try{if(sessionStorage.getItem(${JSON.stringify(FORCE_KEY)})==="1"){` +
  `document.documentElement.classList.add(${JSON.stringify(FORCE_CLASS)})}}catch(e){}`;

export function isMotionForced(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains(FORCE_CLASS);
}

// The one gate anything reading the OS preference should call. Returns false for
// a visitor who has opted in, so every consumer honours the override without
// having to know it exists.
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  if (isMotionForced()) return false;
  return window.matchMedia(REDUCE_MOTION).matches;
}

// The OS asks for reduced motion AND the visitor has not opted in. This is the
// only condition under which there is anything worth asking them about.
export function isReducedMotionUnforced(): boolean {
  if (typeof window === "undefined") return false;
  return !isMotionForced() && window.matchMedia(REDUCE_MOTION).matches;
}

// Opt in for the session. RELOADS, and that is not laziness: the hero decides
// whether to run at all in a script that fires before the first paint, and the
// scene reads the preference when it mounts. Flipping a class underneath all of
// that leaves half the page believing one thing and half the other. A reload is
// the only way every gate re-reads clean.
export function enableForcedMotion() {
  try {
    sessionStorage.setItem(FORCE_KEY, "1");
  } catch {
    /* storage unavailable (private mode); the class below still covers this load */
  }
  document.documentElement.classList.add(FORCE_CLASS);
  window.location.reload();
}
