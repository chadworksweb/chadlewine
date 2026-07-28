"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import {
  DOORS, DUR, MARK_TEXT, SAID_TEXT, heroLayout, LAYOUT_16_9,
  type HeroCtl, type HeroHud, type HeroLayout,
} from "./heroShapes";
import "./hero.css";

// WebGL/Canvas is client-only: no SSR attempt (avoids window/WebGL-on-server).
const HeroCanvas = dynamic(() => import("./HeroCanvas"), { ssr: false });

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
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const markRef = useRef<HTMLHeadingElement | null>(null);
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

  // The rest layout is a pure function of the STAGE's aspect, not the window's:
  // on this dev route the stage is a 16:9 box inside a wider page, and on the
  // homepage it is the whole viewport. Observing the element covers both, and
  // the scene reads its own canvas size, which is the same box, so the shapes
  // and these labels are driven by one function and cannot drift apart.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<HeroLayout>(LAYOUT_16_9);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const apply = (w: number, h: number) => {
      // heroLayout is memoised per aspect, so an unchanged aspect returns the
      // same object and React bails out rather than re-rendering.
      if (w > 0 && h > 0) setLayout(heroLayout(w / h));
    };
    // Measure once, straight away, rather than waiting on the observer's first
    // callback: those are delivered with the rendering steps, so on a route
    // that mounts with the wrong aspect the doors would hold the server's 16:9
    // default for a frame or more.
    const box = el.getBoundingClientRect();
    apply(box.width, box.height);
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      apply(width, height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="ha-page">
      {/* Dev chrome, and it does not ship. Deliberately NOT a heading: the
          wordmark inside the hero is the h1 now, and this lab label must not
          compete with it. */}
      <div className="ha-head">
        <div className="ha-eyebrow">chadlewine.com / hero / webgl</div>
        <p className="ha-title">Transcend the Machine</p>
      </div>

      <div className="ha-stage" ref={stageRef}>
        <HeroCanvas ctl={ctl} hud={hud} />

        <div className="ha-flood" ref={floodRef} aria-hidden="true" />

        {/* Beat name and timecode are dev instrumentation that rewrites itself
            every frame. Hidden from assistive tech: the intro is decorative and
            should not be narrated. */}
        <div className="ha-hud" aria-hidden="true">
          <span className="ha-beat" ref={beatRef}>THE PULL</span>
          <span className="ha-tc" ref={tcRef}>0.00s</span>
        </div>

        <div className="ha-doors" ref={doorsRef} style={{ opacity: 0, pointerEvents: "none" }}>
          {DOORS.map((d, i) => (
            <a
              key={d.key}
              className="ha-door"
              href={d.route}
              style={{
                left: layout.slots[i].leftPct + "%",
                top: layout.slots[i].labelTopPct + "%",
                "--dh": d.hue,
              } as CSSProperties}
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
          {/* The site's own name at the top of the page, so it is the h1. The
              homepage had no h1 at all before this: every heading on it was an
              h2. Still a sibling of the line, never a parent, per the note
              above. Grid items are blockified either way, so promoting this
              from a span changes the semantics and nothing about the layout. */}
          <h1 className="ha-mark" ref={markRef}>
            <span className="ha-sr">{MARK_TEXT}</span>
            <span className="ha-mark__chars" aria-hidden="true">
              {MARK_TEXT.split("").map((c, i) => (
                <span key={i} className="ha-m">{c === " " ? "\u00a0" : c}</span>
              ))}
            </span>
          </h1>
          <h2 className="ha-said" ref={titleRef} style={{ opacity: 0 }}>
            <span className="ha-sr">{SAID_TEXT}</span>
            {/* Real spaces, not U+00A0. The parent carries white-space:pre-wrap,
                which preserves a lone space inside its own span AND keeps it as
                a line-break opportunity, so the line can wrap on portrait. */}
            <span className="ha-said__chars" aria-hidden="true">
              {SAID_TEXT.split("").map((c, i) => (
                <span key={i} className="ha-c">{c}</span>
              ))}
            </span>
          </h2>
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
