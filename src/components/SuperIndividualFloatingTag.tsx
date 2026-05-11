"use client";

import { useEffect, useRef, useState } from "react";

const IDLE_MS = 5_000;
const ACTIVITY_EVENTS = ["scroll"] as const;

export function SuperIndividualFloatingTag() {
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const reset = () => {
      setIsVisible(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setIsVisible(true), IDLE_MS);
    };

    reset();
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, reset, { passive: true }));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset));
    };
  }, []);

  return (
    <a
      href="#popup"
      className={`si-floating-tag${isVisible ? " si-floating-tag--visible" : ""}`}
      aria-label="Come see me in person at the Pop-Up"
      onClick={() => setIsVisible(false)}
    >
      come see me in person
    </a>
  );
}
