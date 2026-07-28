"use client";

import {
  useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties,
} from "react";
import dynamic from "next/dynamic";
import {
  DOORS, DUR, MARK_TEXT, SAID_TEXT, heroLayout, LAYOUT_16_9,
  type HeroCtl, type HeroHud, type HeroLayout,
} from "./heroShapes";
import { HeroNavJsonLd } from "./HeroNavJsonLd";
import "./hero.css";

// WebGL/Canvas is client-only: no SSR attempt (avoids window/WebGL-on-server).
const HeroCanvas = dynamic(() => import("./HeroCanvas"), { ssr: false });

const FRAME = 1 / 30; // frame-step size (seconds)

// The hero's start state is HIDDEN, and it takes roughly 8 seconds of real time
// for the doors to reach full opacity and 13 for the wordmark, because the
// intro clock runs at half speed until story-t 2.0. Shipping that hidden state
// in the HTML means anything that reads the page without waiting out the whole
// timeline sees an empty hero: Googlebot renders, but it does not sit there for
// 13 seconds, and the five doors are the homepage's primary internal links.
//
// So the hidden state is inverted. The markup ships SETTLED and readable, and
// this script hands control to the animation before the first paint, which is
// why it sits above the stage rather than in an effect: it must run while the
// stage below is still being parsed or there would be a visible flash of the
// finished hero. No JS, no class, and the hero simply renders finished.
//
// The timeout is the failsafe. If the scene never starts (WebGL unavailable,
// a blocked script, a GPU blocklist) nothing would ever clear the hidden state
// and the hero would stay blank, so it releases on its own.
//
// It also stamps ha-hero-top when the hero owns the top of the page, which
// lifts the fixed site header out of view. That has to happen here rather than
// from the nav's scroll handler, because the handler cannot run before the
// first paint and the header would be drawn as a bar across the hero for a
// frame. The nav clears the class once the hero has scrolled past.
const bootScript = (ownsTop: boolean) =>
  '(function(){var d=document.documentElement;d.classList.add("ha-anim");' +
  (ownsTop ? 'd.classList.add("ha-hero-top");' : "") +
  'setTimeout(function(){if(!d.hasAttribute("data-ha-running"))' +
  'd.classList.remove("ha-anim")},4000)})()';

// Reduced motion as an external store. Declared at module scope so the
// subscribe and snapshot functions keep a stable identity across renders.
const REDUCE_MOTION = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const mq = window.matchMedia(REDUCE_MOTION);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
const getReduced = () => window.matchMedia(REDUCE_MOTION).matches;
const getReducedOnServer = () => false;

// One component, two homes. `dev` adds the lab chrome (page header, transport,
// scrubber) and the framed 16:9 box; without it the hero is a full-bleed,
// full-height block for the homepage. Kept as a flag rather than two components
// because the transport mutates the same clock refs the scene reads, and a
// second copy of this markup would drift from the first within a session.
export default function HeroAnimatic({ dev = false }: { dev?: boolean }) {
  // clock state (mutated by the in-canvas ClockDriver)
  const tRef = useRef(0);
  const playingRef = useRef(true);
  const scrubRef = useRef<number | null>(null);
  const stepRef = useRef(0);
  const resetRef = useRef(false);
  const pastRef = useRef(false);
  const heroFadeRef = useRef(1);

  // DOM nodes the HUD driver writes
  const beatRef = useRef<HTMLElement | null>(null);
  const tcRef = useRef<HTMLElement | null>(null);
  const floodRef = useRef<HTMLDivElement | null>(null);
  const doorsRef = useRef<HTMLDivElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const markRef = useRef<HTMLHeadingElement | null>(null);
  const scrubEl = useRef<HTMLInputElement | null>(null);
  const playBtnRef = useRef<HTMLButtonElement | null>(null);

  const ctl = useMemo<HeroCtl>(
    () => ({ tRef, playingRef, scrubRef, stepRef, resetRef, pastRef, heroFadeRef }),
    [],
  );
  const hud = useMemo<HeroHud>(
    () => ({ beatRef, tcRef, floodRef, doorsRef, titleRef, markRef, scrubEl, playBtnRef }),
    [],
  );

  // Respect reduced motion: freeze on the rested menu, skip the plunge. Read
  // through useSyncExternalStore rather than an effect, because a media query
  // IS an external store: setting state from inside an effect body cascades a
  // second render, and this way the hero also reacts if the setting is changed
  // while the page is open. It decides the render loop below as well, since
  // freezing the clock stopped the MOTION but left the scene redrawing the same
  // frame sixty times a second forever.
  const reduced = useSyncExternalStore(subscribeReduced, getReduced, getReducedOnServer);
  useEffect(() => {
    if (!reduced) return;
    tRef.current = 11.4; // rest with the line typed AND the wordmark settled
    playingRef.current = false;
  }, [reduced]);

  // The cosmos is the page's background, so the loop keeps running rather than
  // stopping when the hero scrolls off. What stops is the expensive half: past
  // the hero the doors fade out and the bloom composer is bypassed for a plain
  // render, leaving only the starfield and the nebula, which are sprites and
  // points and cost very little.
  const frameloop = reduced ? "demand" : "always";

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

  // Writes a ref rather than state on purpose: this fires on every scroll
  // crossing, and re-rendering a WebGL canvas to carry a boolean would be
  // absurd. The scene eases off it, so there is no pop at the boundary.
  //
  // Triggered on RATIO, not on isIntersecting. isIntersecting only goes false
  // once the hero has left the viewport completely, so the fade would not even
  // begin until a full screen had been scrolled and the menu would still be
  // hanging over the feed after that. Half gone is the cue to start leaving.
  useEffect(() => {
    const el = stageRef.current;
    // Homepage only. In the lab the stage is a 16:9 box inside a scrolling
    // page, so on a short viewport it can sit below half-visible at rest and
    // the menu would fade out while you are trying to look at it.
    if (dev || !el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        pastRef.current = entry.intersectionRatio < 0.5;
      },
      { threshold: [0, 0.2, 0.35, 0.45, 0.5, 0.55, 0.65, 0.8, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [dev]);

  return (
    <div
      className={dev ? "ha-page" : "hero-transcend full-bleed"}
      // The marker the nav watches to decide when it is allowed back on screen.
      {...(dev ? {} : { "data-nav-below": "" })}
    >
      <script dangerouslySetInnerHTML={{ __html: bootScript(!dev) }} />
      <HeroNavJsonLd />

      {/* Dev chrome, and it does not ship. Deliberately NOT a heading: the
          wordmark inside the hero is the h1 now, and this lab label must not
          compete with it. */}
      {dev && (
        <div className="ha-head">
          <div className="ha-eyebrow">chadlewine.com / hero / webgl</div>
          <p className="ha-title">Transcend the Machine</p>
        </div>
      )}

      {/* On the homepage the canvas is FIXED to the viewport, so the cosmos
          stays behind the whole page and the feed scrolls through it rather
          than the page changing worlds at the fold. That is why it sits outside
          .ha-stage: the stage carries `container-type: size`, and size
          containment makes an element a containing block for fixed descendants,
          which would pin the canvas to the stage instead of the viewport. In
          the lab it stays inside the framed box, where being clipped is the
          point. */}
      {!dev && (
        <div className="ha-cosmos" aria-hidden="true">
          <HeroCanvas ctl={ctl} hud={hud} frameloop={frameloop} />
        </div>
      )}

      <div className="ha-stage" ref={stageRef}>
        {dev && <HeroCanvas ctl={ctl} hud={hud} frameloop={frameloop} />}

        <div className="ha-flood" ref={floodRef} aria-hidden="true" />

        {/* Beat name and timecode are dev instrumentation that rewrites itself
            every frame. Hidden from assistive tech: the intro is decorative and
            should not be narrated. */}
        {dev && (
          <div className="ha-hud" aria-hidden="true">
            <span className="ha-beat" ref={beatRef}>THE PULL</span>
            <span className="ha-tc" ref={tcRef}>0.00s</span>
          </div>
        )}

        {/* No inline opacity: the hidden state is CSS gated on .ha-anim, so the
            server-rendered markup carries five live, visible links. It also
            fixes the keyboard trap, since pointer-events:none blocks the mouse
            but not tabbing, so these were five invisible tab stops for the
            first eight seconds. */}
        <div className="ha-doors" ref={doorsRef}>
          {DOORS.map((d, i) => (
            <a
              key={d.key}
              className="ha-door"
              href={d.route}
              style={{
                left: layout.slots[i].leftPct + "%",
                top: layout.slots[i].cellTopPct + "%",
                width: layout.slots[i].cellWidthPct + "%",
                height: layout.slots[i].cellHeightPct + "%",
                "--dh": d.hue,
              } as CSSProperties}
              aria-label={`${d.label} - ${d.route}`}
            >
              <span className="ha-door__lab">{d.label}</span>
              <span className="ha-door__rt">{d.route}</span>
            </a>
          ))}

          {/* The way in. Nothing else told you the page continued below a hero
              that fills the whole screen. A real anchor, not a click handler:
              the site already sets scroll-behavior:smooth globally, so this
              smooth-scrolls with no JS at all and still works without it.
              Lives inside .ha-doors so it arrives on the same clock as the
              menu rather than needing its own line in the driver. */}
          {!dev && (
            <a className="ha-enter" href="#home-enter">
              <span className="ha-enter__lab">enter homepage</span>
              <svg
                className="ha-enter__chev"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </a>
          )}
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
          <h2 className="ha-said" ref={titleRef}>
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

      {dev && (
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
      )}
    </div>
  );
}
