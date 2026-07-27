"use client";

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { DOORS, DUR, MARK_TEXT, SAID_TEXT, type HeroCtl, type HeroHud } from "./heroShapes";
import "./hero.css";

// WebGL/Canvas is client-only: no SSR attempt (avoids window/WebGL-on-server).
const HeroCanvas = dynamic(() => import("./HeroCanvas"), { ssr: false });

// Left/center percentages for the five resting slots, matching SLOT_X projected
// at the rest camera (z=13.4, fov 55, 16:9). Doors sit under their shapes.
const SLOT_PCT = [17.7, 33.9, 50, 66.1, 82.3];
const FRAME = 1 / 30; // frame-step size (seconds)

export default function HeroAnimatic() {
  // clock state (mutated by the in-canvas ClockDriver)
  const tRef = useRef(0);
  const playingRef = useRef(true);
  const scrubRef = useRef<number | null>(null);
  const stepRef = useRef(0);
  const resetRef = useRef(false);

  // DOM nodes the HUD driver writes
  const beatRef = useRef<HTMLElement | null>(null);
  const tcRef = useRef<HTMLElement | null>(null);
  const floodRef = useRef<HTMLDivElement | null>(null);
  const doorsRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLParagraphElement | null>(null);
  const markRef = useRef<HTMLSpanElement | null>(null);
  const scrubEl = useRef<HTMLInputElement | null>(null);
  const playBtnRef = useRef<HTMLButtonElement | null>(null);

  const ctl = useMemo<HeroCtl>(() => ({ tRef, playingRef, scrubRef, stepRef, resetRef }), []);
  const hud = useMemo<HeroHud>(
    () => ({ beatRef, tcRef, floodRef, doorsRef, titleRef, markRef, scrubEl, playBtnRef }),
    [],
  );

  // Respect reduced motion: freeze on the rested menu, skip the plunge.
  useEffect(() => {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      tRef.current = 11.4; // rest with the line typed AND the wordmark settled
      playingRef.current = false;
    }
  }, []);

  return (
    <div className="ha-page">
      <div className="ha-head">
        <div className="ha-eyebrow">chadlewine.com / hero / webgl</div>
        <h1 className="ha-title">Transcend the Machine</h1>
      </div>

      <div className="ha-stage">
        <HeroCanvas ctl={ctl} hud={hud} />

        <div className="ha-flood" ref={floodRef} aria-hidden="true" />

        <div className="ha-hud">
          <span className="ha-beat" ref={beatRef}>THE PULL</span>
          <span className="ha-tc" ref={tcRef}>0.00s</span>
        </div>

        <div className="ha-doors" ref={doorsRef} style={{ opacity: 0, pointerEvents: "none" }}>
          {DOORS.map((d, i) => (
            <a
              key={d.key}
              className="ha-door"
              href={d.route}
              style={{ left: SLOT_PCT[i] + "%", "--dh": d.hue } as CSSProperties}
              aria-label={`${d.label} - ${d.route}`}
            >
              <span className="ha-door__lab">{d.label}</span>
              <span className="ha-door__rt">{d.route}</span>
            </a>
          ))}
        </div>

        {/* THE ADDRESS. Real DOM text, not drawn into the canvas, so it stays
            selectable and crawlable when this grafts onto the homepage. The
            wordmark is a SIBLING of the line, never a child: the driver writes
            blur, letter-spacing and a chromatic text-shadow onto .ha-said, and
            all three inherit. Nested, the wordmark would smear and stretch with
            it. A one-cell grid keeps the two concentric instead. */}
        <div className="ha-address">
          {/* Both lines carry a screen-reader copy of the real sentence, and the
              per-character spans beside it are decorative. Split text still
              reads correctly to a crawler, but a screen reader would announce
              it letter by letter -- same reason the chadworks hero does this. */}
          <span className="ha-mark" ref={markRef}>
            <span className="ha-sr">{MARK_TEXT}</span>
            <span className="ha-mark__chars" aria-hidden="true">
              {MARK_TEXT.split("").map((c, i) => (
                <span key={i} className="ha-m">{c === " " ? "\u00a0" : c}</span>
              ))}
            </span>
          </span>
          <p className="ha-said" ref={titleRef} style={{ opacity: 0 }}>
            <span className="ha-sr">{SAID_TEXT}</span>
            <span className="ha-said__chars" aria-hidden="true">
              {SAID_TEXT.split("").map((c, i) => (
                <span key={i} className="ha-c">{c === " " ? "\u00a0" : c}</span>
              ))}
            </span>
          </p>
        </div>
      </div>

      <div className="ha-controls">
        <div className="ha-transport">
          <button
            className="ha-tbtn"
            type="button"
            aria-label="Step back one frame"
            title="Previous frame"
            onClick={() => {
              stepRef.current = -FRAME;
            }}
          >
            ‹|
          </button>
          <button
            className="ha-tbtn ha-tbtn--play"
            type="button"
            ref={playBtnRef}
            aria-label="Play or pause"
            title="Play / pause"
            onClick={() => {
              playingRef.current = !playingRef.current;
            }}
          >
            ❚❚
          </button>
          <button
            className="ha-tbtn"
            type="button"
            aria-label="Step forward one frame"
            title="Next frame"
            onClick={() => {
              stepRef.current = FRAME;
            }}
          >
            |›
          </button>
          <button
            className="ha-tbtn"
            type="button"
            aria-label="Replay from the start"
            title="Replay"
            onClick={() => {
              resetRef.current = true;
            }}
          >
            ⟲
          </button>
        </div>

        <input
          className="ha-scrub"
          ref={scrubEl}
          type="range"
          min={0}
          max={DUR * 100}
          defaultValue={0}
          step={1}
          aria-label="Scrub the animatic"
          onInput={(e) => {
            scrubRef.current = e.currentTarget.valueAsNumber / 100;
          }}
          onPointerUp={() => {
            scrubRef.current = null;
          }}
          onKeyUp={() => {
            scrubRef.current = null;
          }}
        />
      </div>
    </div>
  );
}
