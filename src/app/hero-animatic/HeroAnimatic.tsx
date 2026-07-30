"use client";

import {
  useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties,
} from "react";
import dynamic from "next/dynamic";
import {
  DOORS, DUR, MARK_TEXT, SAID_TEXT, VEIL_MAX, FADE_SECS, SKIP_SECS, LOAD_IN, LOAD_OUT,
  T_SETTLED,
  heroLayout, LAYOUT_16_9,
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
// It used to be 4 seconds, and 4 seconds called every phone broken. Time to the
// scene's first frame, measured on the production build: 2.9s on the desktop
// this was written on, 4.5s at 2x CPU throttle, 7.2s at 4x, 12.7s at 6x. So on
// a phone the failsafe fired mid-intro essentially every time, and that is not
// a graceful degradation: it leaves the driver running against markup that is
// no longer hidden. Every character of the tagline sits there from the first
// frame while the caret types across text that is already visible, and ha-lock
// goes out with it, so the page never holds still either. Both of those were
// reported as separate mobile bugs. They were this one line.
//
// A timeout cannot tell "broken" from "slow", so it no longer tries. The number
// is now a true ceiling, matched to the lock's own so there is one figure to
// reason about, and the case it used to be racing (no usable WebGL) is answered
// directly by a probe in an effect below rather than waited out. What is left
// for the ceiling is only the pathological tail: a context that dies after it
// was created, a hydration error, a chunk that never arrives.
//
// It also stamps ha-hero-top when the hero owns the top of the page, which
// lifts the fixed site header out of view. That has to happen here rather than
// from the nav's scroll handler, because the handler cannot run before the
// first paint and the header would be drawn as a bar across the hero for a
// frame. The nav clears the class once the hero has scrolled past.
//
// And it takes the scroll. The animatic is meant to be watched, not scrolled
// through at the halfway mark, so the page holds still until it has finished.
// That has to be stamped here for the same reason as the class above: a lock
// applied after hydration is a lock you can already have scrolled past.
// Four conditions keep it honest, and all four are failures of the lock in
// the safe direction:
//   - a page that loaded already scrolled is not showing the intro, so it is
//     never pinned (a back-navigation restores the reader where they left);
//   - nor is a page loaded on a fragment. The way out below pushes
//     /#home-enter into history, so that URL gets shared and reloaded, and it
//     means "put me at the feed" -- locking there would pin someone to a
//     screen they did not ask to sit on;
//   - reduced motion skips the animatic entirely, so there is nothing to hold
//     the page for;
//   - the timeout is the hard ceiling. HudDriver lifts the lock when the
//     wordmark settles, but that is a render loop, and a lost WebGL context or
//     a throttled tab must not be able to strand the page.
// The scene failsafe below covers the other half: a scene that never starts.
const bootScript = (home: boolean) =>
  '(function(){var d=document.documentElement;d.classList.add("ha-anim");' +
  'var m=matchMedia("(prefers-reduced-motion:reduce)").matches;' +
  (home
    ? 'd.classList.add("ha-hero-top");' +
      'if(!window.scrollY&&!location.hash&&!m){' +
      'd.classList.add("ha-lock");' +
      'setTimeout(function(){d.classList.remove("ha-lock")},20000)}'
    : "") +
  'setTimeout(function(){if(!d.hasAttribute("data-ha-running")){' +
  'd.classList.remove("ha-anim");d.classList.remove("ha-lock")}},20000);' +
  // A restored scroll position means this is not the top of a fresh page,
  // whatever scrollY read at parse time. Browsers restore AFTER this script
  // runs, so the guard above cannot see it, and being held on a screen you did
  // not ask to sit on is the one failure the lock must never produce.
  'addEventListener("load",function(){if(window.scrollY)' +
  'd.classList.remove("ha-lock")})})()';

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
  const bloomFadeRef = useRef(1);
  const abortRef = useRef(1);

  // DOM nodes the HUD driver writes
  const beatRef = useRef<HTMLElement | null>(null);
  const tcRef = useRef<HTMLElement | null>(null);
  const floodRef = useRef<HTMLDivElement | null>(null);
  const doorsRef = useRef<HTMLDivElement | null>(null);
  const enterRef = useRef<HTMLAnchorElement | null>(null);
  const veilRef = useRef<HTMLDivElement | null>(null);
  const loadRef = useRef<HTMLDivElement | null>(null);
  // The skip transition owns the hero's fade from the click until it lands, so
  // the scroll observer must not argue with it on the way down. Its runner is
  // handed out by the effect that owns the veil, because the two are one move.
  const skipRef = useRef(false);
  const runSkipRef = useRef<(() => void) | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const markRef = useRef<HTMLHeadingElement | null>(null);
  const scrubEl = useRef<HTMLInputElement | null>(null);
  const playBtnRef = useRef<HTMLButtonElement | null>(null);

  const ctl = useMemo<HeroCtl>(
    () => ({ tRef, playingRef, scrubRef, stepRef, resetRef, pastRef, bloomFadeRef, skipRef, abortRef }),
    [],
  );
  const hud = useMemo<HeroHud>(
    () => ({ beatRef, tcRef, floodRef, doorsRef, enterRef, titleRef, markRef, scrubEl, playBtnRef }),
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
    tRef.current = T_SETTLED;
    playingRef.current = false;
    // There is no animatic left to hold the page for. The boot script already
    // declines to lock when reduced motion is set at load; this covers the
    // setting being turned on while the page is open, which the store above
    // reacts to but the render loop may not, since it is on demand by then.
    document.documentElement.classList.remove("ha-lock");
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
      if (w > 0 && h > 0) setLayout(heroLayout(w / h, h));
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
        // The skip has already declared the hero gone and is fading it out
        // where it stands. This fires several times on the way down and would
        // reverse that the moment the hero was more than half on screen.
        if (skipRef.current) return;
        pastRef.current = entry.intersectionRatio < 0.5;
      },
      { threshold: [0, 0.2, 0.35, 0.45, 0.5, 0.55, 0.65, 0.8, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [dev]);

  // THE VEIL, driven straight off scroll position. Pure f(scrollY) like the
  // rest of the piece: fully on once the hero is exactly one screen behind you,
  // and it unwinds the same way coming back up, so there is no state to get out
  // of step with where the page actually is.
  //
  // Measured against the STAGE, not the window. The hero starts at page y=0
  // (its negative margin cancels main's padding for the fixed header), so it is
  // entirely behind you at scrollY == the stage's own height, whatever the
  // browser chrome is doing to the visible viewport on a phone. Cached and
  // remeasured on resize rather than read per event, so scrolling never forces
  // layout.
  //
  // Written to the element, not through state, for the same reason the fade
  // past the hero is: this runs on every scroll event and re-rendering a WebGL
  // canvas to carry a number would be absurd. Opacity composites, so the whole
  // thing costs one property write.
  useEffect(() => {
    const stage = stageRef.current;
    const veil = veilRef.current;
    if (dev || !stage || !veil) return;
    let h = stage.getBoundingClientRect().height;
    // The skip's own contribution, on top of whatever the scroll is asking for.
    // ONE function writes this element, always, from those two inputs. A CSS
    // transition on the veil would have been simpler and is exactly the trap
    // the doors already fell into: a transition on a property something else
    // writes per frame is retargeted on every write and fights the curve it is
    // sitting on.
    let skipVeil = 0;
    const paint = () => {
      const p = h > 0 ? Math.min(1, Math.max(0, window.scrollY / h)) : 0;
      veil.style.opacity = String(VEIL_MAX * Math.max(p, skipVeil));
    };
    const remeasure = () => {
      h = stage.getBoundingClientRect().height;
      paint();
    };

    // THE SKIP: close the animatic, THEN travel.
    //
    // Every earlier version raced the scroll and lost. The canvas is fixed to
    // the viewport, so anything still rendering when the page lands renders
    // over the feed: measured, the smooth scroll finished at 120ms and the
    // intro was still visible through the page at 600. Outrunning it was the
    // wrong fix. The page simply does not move until the animatic has finished
    // closing, and an indicator covers the wait so the click has an answer
    // immediately.
    //
    // CLOSING: the indicator comes up, the veil comes on, and every hero layer
    // dissolves over SKIP_SECS. The page is still held, so nothing is racing
    // anything. The clock cuts to the settled menu on the frame the dissolve
    // reaches zero, which is a frame with nothing on it to see the cut.
    // TRAVELLING: only then is the lock released and the scroll started, with
    // the indicator dissolving into the move. The abort is held out for the
    // whole journey so the hero cannot fade back in while it is still on
    // screen; it is released at the end, off screen, ready for a scroll back up.
    let raf = 0;
    let running = false;
    const runSkip = () => {
      if (running) return; // a second press during the transition changes nothing
      running = true;
      skipRef.current = true;
      pastRef.current = true;
      const load = loadRef.current;
      const fill = load?.querySelector<HTMLElement>(".ha-load__fill") ?? null;
      let prev = -1, spent = 0, travelling = false;
      const step = (now: number) => {
        const dt = prev < 0 ? 1 / 60 : Math.min(0.05, (now - prev) / 1000);
        prev = now;
        spent += dt;
        if (!travelling) {
          if (load) load.style.opacity = String(Math.min(1, spent / LOAD_IN));
          // Determinate on purpose: the bar is not a decoration waiting on
          // nothing, it is how much of the animatic has actually gone.
          if (fill) fill.style.transform = `scaleX(${(1 - abortRef.current).toFixed(4)})`;
          skipVeil = Math.min(1, skipVeil + dt / SKIP_SECS);
          paint();
          // Closed, or the escape hatch: a render loop that stalls must never
          // leave the page held with no way on.
          if (abortRef.current <= 0.001 || spent > 2) {
            if (fill) fill.style.transform = "scaleX(1)";
            tRef.current = DUR;
            document.documentElement.classList.remove("ha-lock");
            document
              .getElementById("home-enter")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
            travelling = true;
            spent = 0;
          }
        } else {
          if (load) load.style.opacity = String(Math.max(0, 1 - spent / LOAD_OUT));
          skipVeil = Math.max(0, skipVeil - dt / FADE_SECS);
          paint();
          // The scroll is smooth and its length depends on the viewport, so
          // this outlasts it rather than trying to measure it. The hero is a
          // screen above by now; releasing the abort here lets it come back for
          // anyone who scrolls up, without it ever fading in on screen.
          if (spent > Math.max(LOAD_OUT, FADE_SECS) + 0.6) {
            skipRef.current = false;
            running = false;
            return;
          }
        }
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    runSkipRef.current = runSkip;

    paint(); // a page restored mid-scroll must not open clear and then jump
    window.addEventListener("scroll", paint, { passive: true });
    window.addEventListener("resize", remeasure);
    return () => {
      runSkipRef.current = null;
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", paint);
      window.removeEventListener("resize", remeasure);
    };
  }, [dev]);

  // NO USABLE WEBGL, NO WAITING. This is the case the boot script's failsafe was
  // really built for, and asking the question outright beats timing it: the
  // ceiling above can only be generous enough for a slow phone, which makes it
  // far too slow to be the answer for a device that was never going to draw
  // anything. A blocklisted GPU still MOUNTS the canvas and still creates the
  // React tree, so nothing further down the pipeline can be used as the signal
  // either. Only a context can.
  //
  // In an effect rather than the boot script deliberately. Creating a context is
  // a few milliseconds, but the boot script runs before the first paint and the
  // homepage's LCP is already a WebGL canvas, so nothing optional belongs in
  // front of it. The probe context is thrown away immediately: iOS caps how many
  // live contexts a page gets, and the two real ones are about to ask for theirs.
  useEffect(() => {
    if (dev) return;
    const d = document.documentElement;
    if (!d.classList.contains("ha-anim")) return;
    let ok = false;
    try {
      const probe = document.createElement("canvas").getContext("webgl2");
      ok = !!probe;
      probe?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      ok = false;
    }
    if (!ok) {
      d.classList.remove("ha-anim");
      d.classList.remove("ha-lock");
    }
  }, [dev]);

  // The two halves of the scroll lock that CSS cannot do on its own. The lock
  // itself is a class on <html> stamped before the first paint and lifted by
  // HudDriver; see bootScript above.
  useEffect(() => {
    if (dev) return;
    const d = document.documentElement;
    // iOS Safari rubber-bands past a root overflow:hidden on some gesture
    // paths, and a lock that leaks on the device most likely to meet it is not
    // a lock. Guarded on a single finger so pinch zoom is untouched, and read
    // off the class rather than a captured flag so it costs nothing once the
    // animatic has finished.
    const hold = (e: TouchEvent) => {
      if (e.touches.length === 1 && d.classList.contains("ha-lock")) e.preventDefault();
    };
    document.addEventListener("touchmove", hold, { passive: false });
    return () => {
      document.removeEventListener("touchmove", hold);
      // Both classes live on <html>, which survives a client-side navigation,
      // and both are the hero's to clean up when it goes.
      // ha-lock: the doors go live at t 5.3 and the lock does not lift until
      // 11.05, so a visitor can leave for /music while the page is still held,
      // and the destination would arrive unscrollable.
      // ha-hero-top: only the nav clears this, and only while a
      // [data-nav-below] element is on the page to measure. Leave the homepage
      // while the hero still covers the top and there is nothing left to
      // measure, so the class strands: the site header stays hidden on every
      // page after it, and the cookie bar, which now waits on the same signal,
      // never comes back at all.
      d.classList.remove("ha-lock");
      d.classList.remove("ha-hero-top");
    };
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
      {/* THE BACKDROP, in a canvas of its own. It is fixed, so the feed scrolls
          through the starfield, and it is SEPARATE so the hero never has to be.
          A pinned canvas can only move what it draws by drawing it again, which
          made the shapes lag the page by a frame or more; the hero's canvas is
          in the stage below, in flow, moved by the browser for free.
          This is the ONLY sky on the homepage. The hero canvas is transparent
          and stands in front of it, so the backdrop is fixed from the first
          frame of the animatic to the bottom of the feed and never moves. */}
      {!dev && (
        <div className="ha-cosmos" aria-hidden="true">
          <HeroCanvas ctl={ctl} hud={hud} frameloop={frameloop} mode="cosmos" />
        </div>
      )}

      {/* THE VEIL. Black over the cosmos, coming on with the scroll, so the
          feed reads against a settled sky rather than a live starfield. A
          sibling of the canvas and immediately after it, which is what puts it
          over the cosmos and still under everything in the page. Outside
          .ha-stage for the same reason the canvas is: size containment there
          would make the stage its containing block and pin it to the hero. */}
      {!dev && <div className="ha-veil" ref={veilRef} aria-hidden="true" />}

      {/* THE INDICATOR. Only ever driven by the skip, which is why it carries
          no state and no copy the rest of the page has to know about. Fixed to
          the viewport rather than the stage, so it holds its place while the
          page travels underneath it. Decorative: the anchor below is what
          actually announces where this goes, and a screen reader has no use for
          a progress bar covering a transition it cannot see. */}
      {!dev && (
        <div className="ha-load" ref={loadRef} aria-hidden="true">
          <div className="ha-load__rail">
            <div className="ha-load__fill" />
          </div>
          <span className="ha-load__lab">loading</span>
        </div>
      )}

      <div className="ha-stage" ref={stageRef}>
        {/* The hero itself, in the page. Both homes again, which is what they
            were before the cosmos was extracted: it belongs to the stage, it
            scrolls with the stage, and its shapes stay welded to their labels
            because the browser is moving both of them, not a render loop. */}
        <HeroCanvas ctl={ctl} hud={hud} frameloop={frameloop} mode={dev ? "full" : "hero"} />

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

        </div>

        {/* The way in, and the way out. Nothing else told you the page
            continued below a hero that fills the whole screen, and now that the
            page is held still until the animatic finishes, nothing else lets
            you leave early either. One control for both: it always means "take
            me to the page", which is what a skip is.

            A real anchor, not a click handler: the site sets
            scroll-behavior:smooth globally, so this smooth-scrolls with no JS
            and still works without it. The handler only releases the lock and
            lets the anchor do its own job -- no preventDefault, because
            unlocking synchronously means the document is scrollable again by
            the time the fragment navigation runs.

            A SIBLING of .ha-doors now, not a child. It used to ride the menu's
            opacity, which put it on screen at 5.75 and left the first eight
            seconds of the lock with no way out of it. Same box either way
            (.ha-doors is inset:0 on the stage), so the geometry is unchanged;
            only the clock moved. */}
        {!dev && (
          <a
            className="ha-enter"
            href="#home-enter"
            ref={enterRef}
            onClick={(e) => {
              // Nothing left to close: the animatic has already finished, or
              // the transition was never handed over. Let the anchor do its own
              // scrolling, which is also the no-JS path.
              if (!runSkipRef.current || tRef.current >= DUR) {
                document.documentElement.classList.remove("ha-lock");
                return;
              }
              // Otherwise JS owns the whole move. The anchor must NOT scroll
              // here: the page holds still while the animatic closes, and
              // runSkip releases the lock and starts the travel itself.
              e.preventDefault();
              runSkipRef.current();
            }}
          >
            {/* Two labels in one grid cell, crossfaded by the driver. "enter
                homepage" is the real one: it is what the control means, what a
                crawler reads, and what a screen reader announces, so it is the
                text the anchor takes its accessible name from and the state
                that renders with no JS at all. "skip" is a costume the button
                wears while the animatic is running, so it is decorative and
                hidden from assistive tech. */}
            <span className="ha-enter__labs">
              <span className="ha-enter__lab">enter homepage</span>
              <span className="ha-enter__skip" aria-hidden="true">skip</span>
            </span>
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
