"use client";

import { useEffect, useRef, useState } from "react";
import { usePlayer } from "@/components/PlayerContext";

const IDLE_MS = 5_000;
const ACTIVITY_EVENTS = ["scroll"] as const;

export function SuperIndividualFloatingTag() {
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Lift the tag above the sticky player when a song is loaded — otherwise
  // the player's fixed bar at bottom:0 sits underneath the tag and obscures it.
  const player = usePlayer();
  const playerShowing = player.current !== null;

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
      href="/irl/super-individual-pop-up"
      className={`si-floating-tag${isVisible ? " si-floating-tag--visible" : ""}${playerShowing ? " si-floating-tag--lifted" : ""}`}
      aria-label="Come see me in person at the Super Individual Pop-Up"
      onClick={() => setIsVisible(false)}
    >
      come see me in person
    </a>
  );
}
