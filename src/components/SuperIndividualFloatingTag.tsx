"use client";

import { useEffect, useRef, useState } from "react";
import { usePlayer } from "@/components/PlayerContext";

const IDLE_MS = 5_000;
const ACTIVITY_EVENTS = ["scroll"] as const;
const SNOOZE_KEY = "si-floating-tag-snoozed";

export function SuperIndividualFloatingTag() {
  const [isVisible, setIsVisible] = useState(false);
  const [isSnoozed, setIsSnoozed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Lift the tag above the sticky player when a song is loaded — otherwise
  // the player's fixed bar at bottom:0 sits underneath the tag and obscures it.
  const player = usePlayer();
  const playerShowing = player.current !== null;

  useEffect(() => {
    try {
      if (sessionStorage.getItem(SNOOZE_KEY) === "1") {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- browser-only: read sessionStorage on mount
        setIsSnoozed(true);
        return;
      }
    } catch {
      // sessionStorage may be unavailable (private mode, SSR fallback) — ignore.
    }
  }, []);

  // Idle timer only runs while not snoozed — snooze suspends it; unsnooze resumes it.
  useEffect(() => {
    if (isSnoozed) return;

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
  }, [isSnoozed]);

  const snooze = () => {
    setIsSnoozed(true);
    try { sessionStorage.setItem(SNOOZE_KEY, "1"); } catch {}
  };

  const unsnooze = () => {
    setIsSnoozed(false);
    setIsVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    try { sessionStorage.removeItem(SNOOZE_KEY); } catch {}
  };

  const classes = [
    "si-floating-tag",
    isVisible && "si-floating-tag--visible",
    playerShowing && "si-floating-tag--lifted",
    isSnoozed && "si-floating-tag--snoozed",
  ].filter(Boolean).join(" ");

  return (
    <div className={classes} aria-hidden={!isVisible && !isSnoozed}>
      <div className="si-floating-tag__inner">
        {isSnoozed ? (
          <button
            type="button"
            className="si-floating-tag__expand"
            onClick={unsnooze}
            aria-label="Show 'come see me in person' bubble"
          >
            <span aria-hidden="true">&lsaquo;</span>
          </button>
        ) : (
          <>
            <a
              href="/irl/super-individual-pop-up"
              className="si-floating-tag__link"
              aria-label="Come see me in person at the Super Individual Pop-Up"
              onClick={() => setIsVisible(false)}
            >
              come see me in person
            </a>
            <button
              type="button"
              className="si-floating-tag__close"
              onClick={snooze}
              aria-label="Snooze this notification"
            >
              &times;
            </button>
          </>
        )}
      </div>
    </div>
  );
}
