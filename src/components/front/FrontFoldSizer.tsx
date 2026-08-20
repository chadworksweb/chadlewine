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
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    for (const cell of cells) {
      const panel = cell.querySelector(".front__panel");
      if (panel) ro.observe(panel);
    }
    return () => ro.disconnect();
  }, []);

  return null;
}
