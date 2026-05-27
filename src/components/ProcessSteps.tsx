"use client";

import { useEffect, useRef, useState } from "react";

// The real-time songwriting steps. Rendered as a 3x2 grid that ripples in with
// a per-step start offset once it scrolls into view. Without JS (or with
// reduced motion) the steps are simply visible - the animation is additive.
const STEPS = [
  "We get on screenshare. I have my DAW open and ready to capture.",
  "We start talking about what you want your song to be about.",
  "The first few lyric ideas will come just from that. I'll lay them down.",
  "You provide feedback.",
  "I keep channeling the song in real time with you until we have a verse and a chorus.",
  "We write the next verse as the arrangement reveals itself.",
];

const STAGGER_MS = 110;

export function ProcessSteps() {
  const ref = useRef<HTMLOListElement>(null);
  // `armed` flips on after mount so the hidden start state only applies when JS
  // can also reveal it; `shown` flips on when the list scrolls into view.
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    setArmed(true);
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <ol
      ref={ref}
      className={`sw-process${armed ? " sw-process--anim" : ""}${shown ? " is-in" : ""}`}
      aria-label="The real-time songwriting process"
    >
      {STEPS.map((step, i) => (
        <li
          key={i}
          className="sw-process__step"
          style={{ transitionDelay: `${i * STAGGER_MS}ms` }}
        >
          <span className="sw-process__num" aria-hidden="true">
            {i + 1}
          </span>
          <p>{step}</p>
        </li>
      ))}
    </ol>
  );
}
