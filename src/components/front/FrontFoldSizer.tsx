"use client";

import { useEffect } from "react";

// Measures each panel and publishes its height as --f-fold on the cell.
//
// WHY THIS EXISTS AT ALL. The fold animates ::details-content's block-size, and
// the natural target for that is `auto` (the content's own height), which
// `interpolate-size: allow-keywords` is supposed to make animatable. Opening
// works. CLOSING does not, and it is not a support gap: on close the contents
// stop being laid out on the first frame, so `auto` resolves to 0 immediately
// and there is no distance left to travel. Traced frame by frame, the panel sat
// at its full 185px for the first 380ms of a 560ms close and then collapsed in
// one step, while the summary bar above it absorbed the entire cell shrink. Two
// motions, which is exactly what it looked like.
//
// A definite length has no such problem: 0 <-> 185px interpolates in both
// directions. So the height is measured once and handed to CSS as a variable.
//
// The measurement is only possible because of a quirk worth writing down: a
// closed <details> hides its contents via ::details-content, NOT by collapsing
// the elements inside it. .front__panel keeps its full box and reports its real
// height while the cell is shut, so nothing has to be opened, unhidden or
// flashed on screen to read it.
//
// WITHOUT THIS COMPONENT the page still works. The CSS falls back to
// var(--f-fold, auto): opening still folds, closing cuts. Nothing is lost and
// no content is hidden, so this is an enhancement rather than a dependency.

// It also holds a closing panel's CONTENTS on screen for the length of the fold.
//
// A <details> hides its contents by flipping ::details-content's
// content-visibility, which is a DISCRETE property: it has no in-between value
// and normally changes on frame one. `transition-behavior: allow-discrete` in
// the stylesheet is what is supposed to defer that flip to the END of the
// close, and in Chromium it does. On iOS Safari it does not: the contents
// vanish instantly and the empty box then folds shut correctly underneath
// them, which reads as the panel blinking out and the row collapsing after it.
//
// So the flip is taken out of the browser's hands. On a close, the cell wears
// .front__cell--closing for exactly one glide, and the stylesheet keeps
// content-visibility visible while it does. The contents ride the fold down and
// are gone by the time the box reaches zero.
//
// The duration is READ FROM --f-glide rather than repeated here, so the hold
// and the fold cannot drift apart in a later edit.

export function FrontFoldSizer() {
  useEffect(() => {
    const cells = Array.from(
      document.querySelectorAll<HTMLElement>(".front__cell--panel")
    );
    if (cells.length === 0) return;

    const measure = () => {
      for (const cell of cells) {
        const panel = cell.querySelector<HTMLElement>(".front__panel");
        if (!panel) continue;
        // Round up: a fractional height that rounds DOWN leaves a hairline of
        // the panel clipped at rest, which reads as a rendering fault rather
        // than as a measurement one.
        const h = Math.ceil(panel.getBoundingClientRect().height);
        if (h > 0) cell.style.setProperty("--f-fold", `${h}px`);
      }
    };

    measure();

    // The panels reflow with the viewport (the art thumbnail and the video
    // stage are both clamped against vh, and the prose rewraps), so a stale
    // measurement would leave the fold short or long after a resize. Observing
    // the panels themselves rather than listening on window catches font loads
    // and late images too, which a resize listener would miss.
    //
    // Guarded because ResizeObserver is the one API here old enough to be worth
    // checking for; without it the first measurement simply stands.
    // The closing hold. `toggle` fires for the accordion's own auto-close too
    // (opening one cell shuts its sibling), so both routes are covered.
    const CLOSING = "front__cell--closing";
    const timers = new Map<HTMLElement, number>();
    const glideMs = (el: HTMLElement) => {
      const raw = getComputedStyle(el).getPropertyValue("--f-glide").trim();
      const n = parseFloat(raw);
      if (!Number.isFinite(n)) return 560;
      return raw.endsWith("ms") ? n : n * 1000;
    };
    const onToggle = (event: Event) => {
      const cell = event.currentTarget as HTMLElement;
      const pending = timers.get(cell);
      if (pending) {
        window.clearTimeout(pending);
        timers.delete(cell);
      }
      if ((cell as HTMLDetailsElement).open) {
        cell.classList.remove(CLOSING);
        return;
      }
      cell.classList.add(CLOSING);
      timers.set(
        cell,
        window.setTimeout(() => {
          cell.classList.remove(CLOSING);
          timers.delete(cell);
        }, glideMs(cell))
      );
    };
    for (const cell of cells) cell.addEventListener("toggle", onToggle);

    const cleanupToggles = () => {
      for (const cell of cells) cell.removeEventListener("toggle", onToggle);
      for (const id of timers.values()) window.clearTimeout(id);
      timers.clear();
    };

    if (typeof ResizeObserver === "undefined") return cleanupToggles;
    const ro = new ResizeObserver(() => measure());
    for (const cell of cells) {
      const panel = cell.querySelector(".front__panel");
      if (panel) ro.observe(panel);
    }
    return () => {
      ro.disconnect();
      cleanupToggles();
    };
  }, []);

  return null;
}
