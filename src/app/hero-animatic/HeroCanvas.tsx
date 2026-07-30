"use client";

/* Transcend the Machine - the real WebGL hero (R3F + three).
 *
 * The 6-second deprogramming, then the living menu. Four beats:
 *   PULL/TUNNEL  a lattice of cold machine solids rushes past the camera, violet
 *                rush-streaks radiating, camera plunging in.
 *   BREAK        white flood + a shard burst; the machine clears.
 *   ASSEMBLY     the five doors emerge from the origin and settle into their slots.
 *   REST         they idle in the open cosmos (starfield + nebula + orbital rings),
 *                each a nested-shell "PsycheAura" of its own solid, and become nav.
 *
 * Emissive vector aesthetic: no lights, everything self-lit Line/Basic materials
 * with AdditiveBlending over black FogExp2, lit entirely by a real UnrealBloom
 * pass (the transcend-spike stack). Crystal-facet surfaces are a later upgrade. */

/* eslint-disable react-hooks/immutability -- The shared clock IS mutation. Every
 * driver in this file reads and writes `ctl`, a bag of refs handed down as a
 * prop, because one clock read identically by every useFrame and by the DOM
 * overlay is the only thing keeping the scene and its labels from drifting
 * apart (see HeroCtl in heroShapes). Carrying that through React state would
 * re-render a WebGL canvas sixty times a second to move a number. The rule
 * cannot see the difference between mutating a prop and mutating a ref that
 * arrived as one, and it fires nine times here, which is nine standing errors
 * nobody reads and a tenth real one nobody would notice. Scoped to this file
 * and this rule only. */

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import {
  DOORS, PHI, SHELLS, SHELL_FALLOFF, DUR, SAID_IN, SAID_OUT,
  MARK_IN, MARK_OUT, MARK_TEXT, ENTER_IN, ENTER_OUT, ENTER_DIM, FADE_SECS, SKIP_SECS, COL_PERI, COL_VOID,
  CAM_FOV, CAM_Z_REST,
  clamp, lerp, smooth, easeOut, backOut, beatName, heroT, getGeo, heroLayout,
  type Door, type HeroCtl, type HeroHud,
} from "./heroShapes";

const FOG_DENSITY = 0.014; // the spike value: lets the grid + warp core read across depth

// ---- bloom composer (manual-render, no post-processing dep) -----------------
function HeroBloom({ ctl }: { ctl: HeroCtl }) {
  const { gl, scene, camera, size } = useThree();
  const bloomRef = useRef<UnrealBloomPass | null>(null);
  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 0.7, 0.6, 0.28);
    bloomRef.current = bloom;
    c.addPass(bloom);
    c.addPass(new OutputPass());
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);
  // The composer's pixel ratio has to BE the renderer's, read back off the
  // renderer rather than computed a second time. This used to compute its own
  // min(dpr, 2), which on a 3x phone is 2 while the Canvas above caps the buffer
  // at 1.5, and EffectComposer.setPixelRatio calls renderer.setPixelRatio for
  // you, so the two were arguing over one number every time the size changed.
  //
  // Measured, R3F won that argument: the draw buffer came out 585x1266 for a
  // 390x844 box either way, before the resize and after it. What the old line
  // actually did was size the composer's own render TARGETS for a ratio of 2
  // against a buffer being drawn at 1.5, so every pass ran at a resolution the
  // output did not share. Reading the value back keeps them in lockstep by
  // construction and there is no second number left to drift.
  //
  // Worth being precise about what this is NOT: it was changed while chasing
  // coloured speckle over the nebula on a phone, and it does not explain it.
  // The mismatch is real and this is the right shape, but the speckle was never
  // reproduced off-device (SwiftShader renders the same frame clean), so it is
  // not evidence either way and the phone is still the only judge of it.
  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, gl, size]);
  useEffect(() => () => composer.dispose(), [composer]);
  useFrame((state) => {
    const t = heroT(state.clock.elapsedTime, ctl);
    const fade = ctl.bloomFadeRef.current;
    const b = bloomRef.current;
    if (b) {
      // Steady phosphor, with a hard pump through the break flash, eased off as
      // the page leaves the hero behind. This is all the scroll fade still
      // does: the hero's own geometry rides the scroll rig off the top of the
      // frame and needs no dissolve, but the glow is thrown across the whole
      // canvas and would otherwise sit on the feed.
      //
      // Past the hero the bloom PASS is switched off, which is where its cost
      // lives, but the composer keeps rendering. Bypassing the composer for a
      // plain gl.render also bypasses OutputPass, and that pass is doing the
      // colour-space conversion: measured frame by frame, dropping it HALVED
      // the luminance of the entire image, starfield included, in one frame.
      // That cliff was the "stepped" fade. Disabling one pass costs the same
      // and changes nothing about how the remaining image is written out.
      const base =
        0.7 + smooth(1.4, 2.3, t) * 0.5 + Math.max(0, smooth(2.2, 2.4, t) - smooth(2.5, 3.1, t)) * 1.1;
      b.strength = base * fade;
      b.enabled = fade > 0.001;
    }
    composer.render();
  }, 1);
  return null;
}

// ---- camera plunge ----------------------------------------------------------
function CameraRig({ ctl }: { ctl: HeroCtl }) {
  const { camera } = useThree();
  useFrame((state) => {
    const t = heroT(state.clock.elapsedTime, ctl);
    const dolly = lerp(15, 13.2, smooth(0, 2.2, t)); // barely a plunge -- steady, not a dive
    // ease back to frame the menu. The resting distance is the shared constant:
    // heroLayout projects the DOM labels from it, so a literal here could drift.
    const back = lerp(13.2, CAM_Z_REST, smooth(2.4, 5, t));
    camera.position.z = t < 2.4 ? dolly : back;
    camera.position.x = Math.sin(t * 0.16) * 0.25 * smooth(4.8, 6, t);
    camera.lookAt(0, 0, 0);
  });
  return null;
}

// ---- the machine: a sparse golden-angle spiral TUNNEL -----------------------
// Solids on the wall of a tube (open centre), placed by the golden angle so the
// spiral never repeats. Depth-faded and slow: you fly DOWN it, you don't hit a
// wall. Sparse on purpose -- restraint is the point.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
function MachineField({ ctl }: { ctl: HeroCtl }) {
  const built = useMemo(() => {
    const group = new THREE.Group();
    const N = 40;
    const TUBE_R = 8.5;
    const motes: { ls: THREE.LineSegments; mat: THREE.LineBasicMaterial; ang: number; r: number; seed: number; spin: number }[] = [];
    for (let i = 0; i < N; i++) {
      // the machine grid is CUBES ONLY, like the artifact / ss5
      const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(i % 8 === 0 ? "#ff2e63" : "#00e0ff"), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const ls = new THREE.LineSegments(getGeo("cube"), mat);
      ls.scale.setScalar(0.14 + ((i * 7) % 11) / 22); // smaller + more variable (~0.14 .. 0.6)
      group.add(ls);
      const r = TUBE_R * (0.9 + 0.22 * ((i % 5) / 5)); // gentle golden variation on the wall
      motes.push({ ls, mat, ang: i * GOLDEN_ANGLE, r, seed: i / N, spin: i });
    }
    return { group, motes };
  }, []);
  useFrame((state) => {
    const t = heroT(state.clock.elapsedTime, ctl);
    const out = 1 - smooth(2.2, 2.9, t);
    built.group.visible = out > 0.01;
    if (out <= 0.01) return;
    const RANGE = 60; // shallower tunnel -> less perspective whoosh near the camera
    const tv = t * 4.2 + 0.9 * Math.pow(Math.max(0, t - 0.5), 2); // rate doubled to offset the 0.5x intro clock -> tunnel drift stays the same, only the ejects slow
    for (const m of built.motes) {
      const zc = (((m.seed * RANGE + tv) % RANGE) + RANGE) % RANGE; // 0..RANGE
      const z = zc - 50; // -50 (vanishing point) -> +10 (past you)
      const near = zc / RANGE; // 0 far, 1 near
      m.ls.position.set(Math.cos(m.ang) * m.r, Math.sin(m.ang) * m.r * 0.8, z); // tube wall, open centre
      m.ls.rotation.x = t * 0.35 + m.spin;
      m.ls.rotation.y = t * 0.28 + m.spin * 0.7;
      m.mat.opacity = (0.08 + 0.5 * near) * out; // depth fade -> airy, receding
    }
  });
  return <primitive object={built.group} />;
}

// ---- the warp core: the centre shape that pulses and ejects the doors --------
function WarpCore({ ctl }: { ctl: HeroCtl }) {
  const built = useMemo(() => {
    const group = new THREE.Group();
    group.position.z = -34;
    // inner: bright cyan core (ss7)
    const coreMat = new THREE.LineBasicMaterial({ color: new THREE.Color("#00e0ff"), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const core = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.0, 1)), coreMat);
    group.add(core);
    // outer: a larger green shell around it (ss7). BOTH stay round -- only ever
    // uniform-scaled and spun, so they never distort vertically.
    const shellMat = new THREE.LineBasicMaterial({ color: new THREE.Color("#3dff9e"), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
    const shell = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.0, 1)), shellMat);
    group.add(shell);
    return { group, core, coreMat, shell, shellMat };
  }, []);
  useFrame((state) => {
    const t = heroT(state.clock.elapsedTime, ctl);
    const vis = 1 - smooth(2.15, 2.5, t);
    built.group.visible = vis > 0.01;
    if (vis <= 0.01) return;
    let pulse = 0; // a bump each time a door ejects (5 ejects)
    for (let i = 0; i < 5; i++) {
      const dd = (t - (0.85 + i * 0.26)) / 0.12;
      pulse += Math.exp(-dd * dd);
    }
    built.core.scale.setScalar(1 + pulse * 0.35); // uniform breathe only
    built.core.rotation.y = t * 1.1;
    built.core.rotation.x = t * 0.6;
    built.coreMat.opacity = (0.55 + 0.4 * Math.min(1, pulse)) * vis;
    built.shell.scale.setScalar(1 + pulse * 0.12);
    built.shell.rotation.y = -t * 0.5; // counter-spin, still round
    built.shell.rotation.x = t * 0.3;
    built.shellMat.opacity = 0.38 * vis;
  });
  return <primitive object={built.group} />;
}

// ---- lightspeed streaks: violet + cream, with a jump-drive surge ------------
// Not LineSegments: WebGL ignores LineBasicMaterial.linewidth, so a line can
// never actually thicken. Each streak is a soft RIBBON whose width is written
// per frame, which is what lets the warp surge swell them.
//
// The ribbon is four stations along the streak -- a point at the inner tip, two
// full cross-sections, a point at the outer tip -- and each cross-section runs
// edge / centre / edge with the EDGES BLACK. Under additive blending a black
// vertex contributes nothing, so the streak feathers out sideways as well as
// lengthwise. That soft falloff is what the Star Trek reference has and what a
// hard-sided quad can never give: density and glow, not bars.
const ST_POS = [0, 0.42, 0.78, 1]; // station positions along the streak
const ST_WID = [0, 0.72, 1, 0]; // width multiplier per station
const ST_LUM = [0, 0.85, 1, 0.35]; // centre brightness per station
const VERTS_PER = 8; // tip + 3 + 3 + tip
const INDEX_PER = 24; // 8 triangles

type StreakSeed = { ang: number; r0: number; lf: number; wf: number };
type StreakSet = { geo: THREE.BufferGeometry; pos: Float32Array; mat: THREE.MeshBasicMaterial; mesh: THREE.Mesh; seeds: StreakSeed[] };

// THE SURGE: nothing at all until 1.46 (before that the streaks are the plain
// thin lines they always were), then ONE forward sequence and nothing else.
// A held beat of hesitation, then a single slow climb that never reverses,
// arriving at full right at the break at 2.2, where it hands the momentum
// straight off to the flood instead of petering out first.
//
// The ramp is SQUARED, which is the hesitation: the first third of the window
// barely moves, and the swell only commits once it has waited. One smooth()
// alone eases in and out symmetrically, which reads as the field deciding
// immediately. Story-time, so the 0.5x intro clock-stretch renders this about
// twice this long in real seconds -- roughly a second and a half of build.
function warpSurge(t: number): number {
  const ramp = smooth(1.46, 2.26, t);
  const release = 1 - smooth(2.55, 2.95, t); // stays lit through the drop-out, so they leave hot
  return ramp * ramp * release;
}

function RushStreaks({ ctl }: { ctl: HeroCtl }) {
  const built = useMemo(() => {
    const mk = (color: string, k: number, salt: number): StreakSet => {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(k * VERTS_PER * 3);
      const col = new Float32Array(k * VERTS_PER * 3);
      const idx = new Uint16Array(k * INDEX_PER);
      const c = new THREE.Color(color);
      // vert layout per streak: 0 = inner tip, 1..3 = station 1 (-n, centre, +n),
      // 4..6 = station 2 (-n, centre, +n), 7 = outer tip.
      const LUM = [ST_LUM[0], 0, ST_LUM[1], 0, 0, ST_LUM[2], 0, ST_LUM[3]];
      for (let s = 0; s < k; s++) {
        const v = s * VERTS_PER;
        for (let e = 0; e < VERTS_PER; e++) {
          const w = LUM[e];
          const j = (v + e) * 3;
          col[j] = c.r * w; col[j + 1] = c.g * w; col[j + 2] = c.b * w;
        }
        const o = s * INDEX_PER;
        const T = v, A0 = v + 1, AC = v + 2, A1 = v + 3, B0 = v + 4, BC = v + 5, B1 = v + 6, U = v + 7;
        const tri = [
          T, A0, AC, T, AC, A1, // tail cone
          A0, B0, AC, B0, BC, AC, // body, minus side
          AC, BC, A1, BC, B1, A1, // body, plus side
          B0, U, BC, BC, U, B1, // nose cone
        ];
        for (let n = 0; n < INDEX_PER; n++) idx[o + n] = tri[n];
      }
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.position.z = 7;
      const seeds: StreakSeed[] = Array.from({ length: k }, (_, s) => ({
        ang: (s / k) * Math.PI * 2 + ((s + salt) % 7) * 0.35,
        r0: 0.3 + ((((s * 97) + salt) % 100) / 100) * 4,
        lf: 0.5 + (((s * 53) + salt) % 100) / 100,
        wf: 0.6 + (((s * 31) + salt) % 100) / 100, // per-streak width variance
      }));
      return { geo, pos, mat, mesh, seeds };
    };
    // Density is the other half of the reference look: the surge has to read as a
    // WALL of light, which comes from many overlapping soft streaks, not few fat
    // ones. So violet and cream keep their ORIGINAL counts (before 1.46 the field
    // has to look exactly as it always did) and all the extra density lives in the
    // flare set, which does not exist until the surge opens it.
    return {
      violet: mk("#a877f0", 68, 0),
      cream: mk("#fff5d6", 30, 17),
      flare: mk("#e8edff", 170, 41), // blue-white, surge-only: the jump-drive wall
    };
  }, []);
  useFrame((state) => {
    const t = heroT(state.clock.elapsedTime, ctl);
    // How far up to speed the field is. Kept separate from the exit so streak
    // length does not collapse on the way out.
    const drive = smooth(0.35, 1.4, t);

    // THE DROP-OUT. The streaks must not blink off -- they get FLUNG. Every
    // streak's inner tip accelerates outward (exit SQUARED, so it builds), which
    // evacuates the field from the centre out and carries each one off through
    // the frame edge, stretching and thinning as it goes. Opacity holds full
    // through all of that and only cuts afterwards as a backstop, by which point
    // they are already off screen. That is the difference between an exit and a
    // fade: you watch them leave.
    const exit = smooth(2.3, 3.0, t);
    const evac = exit * exit * 24; // world units the inner tip races outward
    const rush = drive * (1 - smooth(2.9, 3.15, t));
    const surge = warpSurge(t);

    const draw = (set: StreakSet, lenK: number, op: number, baseW: number, surgeW: number, gate: number) => {
      const vis = rush * gate;
      set.mat.opacity = Math.min(1, op * vis * (1 + surge * 0.9));
      set.mesh.visible = vis > 0.01;
      if (vis <= 0.01) return;
      for (let s = 0; s < set.seeds.length; s++) {
        const sd = set.seeds[s];
        // NO per-streak sine terms. A length wobble phased by streak index and a
        // global width judder were what made the field percolate: a few hundred
        // streaks each breathing on their own phase reads as boiling, not as
        // speed. Length and width now move only with surge and exit, both
        // monotonic, so the whole field swells once, together, and never comes
        // back. The peak width is unchanged -- the old judder only spiked 12%
        // above this for a few frames at a time, so this holds the same ceiling.
        const len = (0.6 + lenK * drive) * (1 + surge * 0.9) * (1 + exit * 1.8) * sd.lf; // stretches as it surges, then again as it leaves
        const hw = (baseW + surgeW * surge) * sd.wf * (1 - 0.62 * exit); // thins out on the way off
        const c = Math.cos(sd.ang);
        const si = Math.sin(sd.ang);
        const nx = -si; // unit normal, perpendicular to the streak
        const ny = c;
        const i = s * VERTS_PER * 3;
        let w = 0;
        for (let st = 0; st < 4; st++) {
          const r = sd.r0 + evac + len * ST_POS[st];
          const px = c * r;
          const py = si * r;
          const hwS = hw * ST_WID[st];
          if (st === 0 || st === 3) {
            set.pos[i + w] = px; set.pos[i + w + 1] = py; set.pos[i + w + 2] = 0;
            w += 3;
          } else {
            set.pos[i + w] = px - nx * hwS; set.pos[i + w + 1] = py - ny * hwS; set.pos[i + w + 2] = 0;
            set.pos[i + w + 3] = px; set.pos[i + w + 4] = py; set.pos[i + w + 5] = 0;
            set.pos[i + w + 6] = px + nx * hwS; set.pos[i + w + 7] = py + ny * hwS; set.pos[i + w + 8] = 0;
            w += 9;
          }
        }
      }
      set.geo.attributes.position.needsUpdate = true;
    };

    // Base widths are hairline on purpose: before the surge these must read as the
    // plain thin lines they were, and ALL the thickness arrives with the jump.
    draw(built.violet, 5.0, 0.34, 0.005, 0.030, 1); // sparse violet
    draw(built.cream, 6.4, 0.6, 0.007, 0.052, 1); // longer, brighter
    draw(built.flare, 8.2, 0.8, 0.0, 0.070, surge); // gated on the surge alone
  });
  return (
    <>
      <primitive object={built.violet.mesh} />
      <primitive object={built.cream.mesh} />
      <primitive object={built.flare.mesh} />
    </>
  );
}

// ---- the break: a golden-angle spiral of short cyan + pink segments (ss4) ---
function BreakShards({ ctl }: { ctl: HeroCtl }) {
  const N = 140;
  const built = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 2 * 3);
    const col = new Float32Array(N * 2 * 3);
    const cyan = new THREE.Color("#00e0ff");
    const pink = new THREE.Color("#ff9ed6");
    const seeds: { base: number; el: number; sp: number }[] = [];
    for (let i = 0; i < N; i++) {
      const c = i % 2 ? cyan : pink;
      const j = i * 6;
      col[j] = c.r; col[j + 1] = c.g; col[j + 2] = c.b;
      col[j + 3] = c.r; col[j + 4] = c.g; col[j + 5] = c.b;
      // golden-angle base + per-segment speed: the short segments lay out along
      // Fibonacci spiral arms and each one spirals as it flies (the ss4 look).
      seeds.push({ base: i * GOLDEN_ANGLE, el: ((i * 37) % 100) / 100 - 0.5, sp: 2.6 + (i % 9) * 0.72 });
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const ls = new THREE.LineSegments(geo, mat);
    ls.position.z = 5;
    return { geo, pos, mat, ls, seeds };
  }, []);
  useFrame((state) => {
    const t = heroT(state.clock.elapsedTime, ctl);
    const life = smooth(2.25, 2.5, t) * (1 - smooth(3.1, 3.7, t)); // lingers so the spiral reads
    built.mat.opacity = life;
    built.ls.visible = life > 0.01;
    if (life <= 0.01) return;
    const age = Math.max(0, t - 2.25);
    const DASH = 0.55; // each segment stays SHORT -- it is a dash, not a streak
    for (let i = 0; i < N; i++) {
      const s = built.seeds[i];
      const r = age * s.sp; // flies out, slowly, so the arms stay on screen
      const ang = s.base + r * 0.9; // twist by radius -> each segment traces a spiral, arms curl
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const j = i * 6;
      built.pos[j] = dx * r; built.pos[j + 1] = dy * r; built.pos[j + 2] = s.el * 2;
      built.pos[j + 3] = dx * (r + DASH); built.pos[j + 4] = dy * (r + DASH); built.pos[j + 5] = s.el * 2;
    }
    built.geo.attributes.position.needsUpdate = true;
  });
  return <primitive object={built.ls} />;
}

// ---- cosmos: starfield (twinkling, varied sizes, seamless full sphere) ------
// A real "twinkle" star sprite: a bright pinpoint core, four long thin
// diffraction spikes (plus four short diagonals) and a soft halo -- the
// look from ss6. Scaled small it reads as a dot; scaled large, a full sparkle.
function makeSparkleTex(): THREE.Texture {
  const S = 128;
  const c = document.createElement("canvas");
  c.width = S; c.height = S;
  const ctx = c.getContext("2d")!;
  const cx = S / 2;
  const cy = S / 2;
  ctx.clearRect(0, 0, S, S);
  ctx.globalCompositeOperation = "lighter";
  // soft halo
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, S * 0.5);
  halo.addColorStop(0, "rgba(255,255,255,0.5)");
  halo.addColorStop(0.16, "rgba(255,255,255,0.22)");
  halo.addColorStop(0.4, "rgba(255,255,255,0.05)");
  halo.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, S, S);
  // a tapered spike blade from the centre outward
  const spike = (len: number, wid: number, ang: number, a: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    const lg = ctx.createLinearGradient(0, 0, len, 0);
    lg.addColorStop(0, `rgba(255,255,255,${a})`);
    lg.addColorStop(0.35, `rgba(255,255,255,${a * 0.35})`);
    lg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(0, -wid);
    ctx.lineTo(len, 0);
    ctx.lineTo(0, wid);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) spike(S * 0.48, 3.2, a, 0.85); // long primaries
  for (const a of [Math.PI / 4, Math.PI * 0.75, Math.PI * 1.25, Math.PI * 1.75]) spike(S * 0.28, 2.0, a, 0.3); // short diagonals
  // bright pinpoint core
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, S * 0.1);
  core.addColorStop(0, "rgba(255,255,255,1)");
  core.addColorStop(0.5, "rgba(255,255,255,0.85)");
  core.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}
const STAR_VERT = `
  attribute float aSize;
  attribute float aPhase;
  attribute float aTwinkle;
  attribute vec3 aColor;
  uniform float uTime;
  varying vec3 vColor;
  varying float vB;
  void main() {
    vColor = aColor;
    float pulse = 0.5 + 0.5 * sin(uTime * 2.1 + aPhase);
    float b = mix(0.85, pulse, aTwinkle); // twinkly stars swing hard, steady stars barely move
    vB = 0.22 + 0.9 * b;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (0.7 + 0.5 * b) * (190.0 / max(0.1, -mv.z));
    gl_Position = projectionMatrix * mv;
  }`;
const STAR_FRAG = `
  uniform sampler2D uTex;
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vB;
  void main() {
    vec4 tx = texture2D(uTex, gl_PointCoord);
    gl_FragColor = vec4(vColor * vB * uOpacity, tx.a);
  }`;
function Starfield({ ctl }: { ctl: HeroCtl }) {
  const N = 1100;
  const built = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const siz = new Float32Array(N);
    const pha = new Float32Array(N);
    const twk = new Float32Array(N);
    const cW = new THREE.Color("#ffffff");
    const cP = new THREE.Color("#b4bfff"); // pale periwinkle
    const cV = new THREE.Color("#a78bfa");
    const cC = new THREE.Color("#8fe6ff");
    for (let i = 0; i < N; i++) {
      // uniform full sphere so slow rotation never empties (seamless wipe)
      const r = 60 + ((i * 53) % 90);
      const th = (((i * 97) % 1000) / 1000) * Math.PI * 2;
      const u = 2 * (((i * 29) % 1000) / 1000) - 1;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      pos[i * 3] = r * s * Math.cos(th);
      pos[i * 3 + 1] = r * s * Math.sin(th) * 0.85;
      pos[i * 3 + 2] = r * u;
      const pk = i % 11; // mostly white, a few tinted
      const c = pk < 8 ? cW : pk === 8 ? cP : pk === 9 ? cV : cC;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      const big = i % 7 === 0; // ~1 in 7 is a prominent sparkle, the rest are dots
      const rnd = ((i * 17) % 100) / 100;
      siz[i] = big ? 5 + rnd * 4.5 : 1.0 + rnd * 1.6;
      twk[i] = big ? 0.6 + rnd * 0.4 : i % 3 === 0 ? 0.4 + rnd * 0.4 : 0.08 + rnd * 0.18; // only some twinkle hard
      pha[i] = ((i * 41) % 628) / 100;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(siz, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(pha, 1));
    geo.setAttribute("aTwinkle", new THREE.BufferAttribute(twk, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uTex: { value: makeSparkleTex() } },
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(geo, mat);
    return { pts, mat };
  }, []);
  useFrame((state) => {
    const t = heroT(state.clock.elapsedTime, ctl);
    built.mat.uniforms.uTime.value = t;
    built.mat.uniforms.uOpacity.value = smooth(2.6, 4.4, t) * 0.95;
    built.pts.rotation.y = t * 0.008; // perpetual seamless wipe
    built.pts.rotation.x = Math.sin(t * 0.05) * 0.04;
  });
  return <primitive object={built.pts} />;
}

// ---- cosmos: nebula blobs ---------------------------------------------------
function makeBlobTex(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.34)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
function Nebula({ ctl }: { ctl: HeroCtl }) {
  const built = useMemo(() => {
    const tex = makeBlobTex();
    const group = new THREE.Group();
    const defs = [
      { c: "#6a4bd0", x: -15, y: 6, z: -30, s: 36 },
      { c: "#3a4ed0", x: 17, y: -8, z: -34, s: 32 },
      { c: "#00e0ff", x: 3, y: 11, z: -26, s: 20 },
      { c: "#8b9cf7", x: -7, y: -11, z: -28, s: 26 },
    ];
    const mats: THREE.MeshBasicMaterial[] = [];
    for (const d of defs) {
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(d.c), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(d.s, d.s), mat);
      mesh.position.set(d.x, d.y, d.z);
      group.add(mesh);
      mats.push(mat);
    }
    return { group, mats };
  }, []);
  useFrame((state) => {
    const t = heroT(state.clock.elapsedTime, ctl);
    const inn = smooth(2.5, 4.4, t);
    for (let i = 0; i < built.mats.length; i++) built.mats[i].opacity = inn * (0.22 + 0.05 * Math.sin(t * 0.3 + i));
  });
  return <primitive object={built.group} />;
}

// ---- a hero door: nested golden-ratio shells of one solid -------------------
const Z_CORE = -34; // where the warp core sits and the doors are born

// PER-SHELL GYROSCOPE. The shells used to share one dominant spin term and
// differ only by a fixed offset plus a shear of a few hundredths, on two axes,
// which is why the nest read as one rigid object instead of four independent
// ones. Now the door's own tumble lives on the GROUP and each shell carries its
// own free three-axis rotation on top.
//
// Rates are stepped by powers of the golden ratio, so no two shells share a
// period and the nest can never re-sync into looking rigid. Inner shells still
// run a little faster (they are smaller, so equal angular rate reads as less
// motion), and neighbours counter-rotate, which is what sells gimbals rather
// than drift.
//
// GYRO_RATE is the one dial for the whole nest. The inner-shell exponent is
// deliberately shallow: at 0.5 the innermost shell ran over 2x the outermost
// and churned, which is the thing that had to come down.
const GYRO_RATE = 0.5;
const GYRO = Array.from({ length: SHELLS }, (_, i) => {
  const k = Math.pow(PHI, i * 0.3) * GYRO_RATE;
  const flip = i % 2 ? -1 : 1;
  return {
    rx: 0.150 * k * flip,
    ry: 0.243 * k,
    rz: 0.097 * k * -flip,
    px: i * 1.3,
    py: i * 0.9,
    pz: i * 2.1, // phases so they start visibly apart, not stacked
  };
});
function gyro(ls: THREE.Object3D, i: number, t: number) {
  const r = GYRO[i];
  ls.rotation.set(r.px + t * r.rx, r.py + t * r.ry, r.pz + t * r.rz);
}
function HeroShape({ door, index, ctl }: { door: Door; index: number; ctl: HeroCtl }) {
  const built = useMemo(() => {
    const group = new THREE.Group();
    const geo = getGeo(door.shape);
    const hue = new THREE.Color(door.hue);
    const shells: THREE.LineSegments[] = [];
    for (let i = 0; i < SHELLS; i++) {
      const mat = new THREE.LineBasicMaterial({ color: COL_PERI.clone(), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
      const ls = new THREE.LineSegments(geo, mat);
      group.add(ls);
      shells.push(ls);
    }
    // warp trail: a bright streak from the warp core to the door while it ejects
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    const trailMat = new THREE.LineBasicMaterial({ color: hue.clone(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const trail = new THREE.LineSegments(trailGeo, trailMat);
    const fall = SHELL_FALLOFF[door.shape]; // denser solids dim faster inward
    return { group, shells, hue, trail, trailGeo, trailMat, fall };
  }, [door.shape, door.hue]);
  useFrame((state) => {
    const t = heroT(state.clock.elapsedTime, ctl);
    const g = built.group;

    if (t < 2.2) {
      // TUNNEL: the actual door ejects from the warp core and streaks past you
      const ejectT = 0.85 + index * 0.26; // staggered -> the core pulses per eject
      const local = t - ejectT;
      const life = smooth(-0.72, 0.5, local); // longer, slower flight (was ~0.85s, now ~1.2s)
      const gone = smooth(0.45, 0.82, local);
      if (life <= 0.001) {
        g.visible = false;
        built.trailMat.opacity = 0;
        return;
      }
      g.visible = true;
      const a = index * 1.9; // its own angle out of the centre
      const z = lerp(Z_CORE, 16, easeOut(life)); // born at core, drifts past the camera
      const latR = life * life * 9; // fans out as it nears
      g.position.set(Math.cos(a) * latR, Math.sin(a) * latR * 0.72, z);
      g.scale.setScalar(lerp(0.25, 2.4, life));
      const alpha = 0.95 * (1 - gone);
      const spin = t * 1.5 + index; // slower tumble
      g.rotation.set(spin * 0.5, spin, 0); // the door's own tumble, whole-body
      for (let i = 0; i < built.shells.length; i++) {
        const ls = built.shells[i];
        ls.scale.setScalar(Math.pow(1 / PHI, i));
        gyro(ls, i, t);
        const m = ls.material as THREE.LineBasicMaterial;
        m.color.copy(built.hue); // ignites in its tier hue straight out of the core
        m.opacity = Math.max(0.03, alpha * (0.62 - i * built.fall));
      }
      const p = built.trailGeo.attributes.position as THREE.BufferAttribute;
      p.setXYZ(0, 0, 0, Z_CORE);
      p.setXYZ(1, g.position.x, g.position.y, g.position.z);
      p.needsUpdate = true;
      built.trailMat.color.copy(built.hue);
      built.trailMat.opacity = alpha * 0.5 * smooth(0, 0.4, life);
      return;
    }

    // ASSEMBLY -> REST: the same door returns to the centre and settles into its slot
    //
    // The slot is the ONLY part of this that is responsive. Everything before
    // 2.2 (the pull, the tunnel, the eject) is untouched at every aspect, so the
    // intro is identical everywhere; only where the doors LAND moves, and only
    // below 3:2 where the authored row genuinely does not fit the frame.
    const lay = heroLayout(state.size.width / state.size.height);
    const slot = lay.slots[index];
    built.trailMat.opacity = 0;
    // The doors belong to the hero, not to the background it leaves behind.
    // They no longer dim on scroll -- they ride the scroll rig off the top of
    // the frame with their own labels. This is the ABORT only: the one case
    // where the menu has to leave without going anywhere.
    const fade = ctl.abortRef.current;
    g.visible = fade > 0.01;
    if (!g.visible) return;
    const ap = clamp((t - 3.2) / 1.5, 0, 1);
    const emerge = t < 3.15 ? 0 : backOut(ap);
    // the artifact's ordered wave: each door phased by index so the row ripples.
    // Scaled with the menu, so the idle drift stays proportional to the shape
    // rather than swamping it on a phone.
    const settle = smooth(4.6, 5.7, t);
    const wave = settle * lay.k * (Math.sin(t * 1.3 + index * 1.1) * 0.16 + Math.sin(t * 0.7 + index) * 0.1);
    g.position.set(lerp(0, slot.x, emerge), lerp(0, slot.y, emerge) + wave, lerp(-2, 0, emerge));
    const breathe = 1 + 0.035 * Math.sin(t * 0.28 + index * 1.3);
    g.scale.setScalar(lerp(0.0, 1.2 * lay.k, easeOut(ap)) * breathe);
    const res = smooth(2.3, 3.6, t);
    const alpha = 0.95 * smooth(2.5, 3.2, t);
    const spin = index + 0.25 * t + 1.6 * smooth(2.2, 4.8, t); // rotation slowed ~50%
    g.rotation.set(spin * 0.5, spin, 0); // the door's own tumble, whole-body
    for (let i = 0; i < built.shells.length; i++) {
      const ls = built.shells[i];
      ls.scale.setScalar(Math.pow(1 / PHI, i)); // golden-ratio inset
      gyro(ls, i, t);
      const m = ls.material as THREE.LineBasicMaterial;
      m.color.lerpColors(COL_PERI, built.hue, res);
      // The 0.04 floor keeps the innermost shells from disappearing during the
      // idle, so the scroll fade has to be applied AFTER it, not folded into
      // alpha. Multiplied in beforehand, every shell dimmed smoothly down to
      // the floor, sat there as a ghost over the feed, and then got cut when
      // g.visible flipped: three stages instead of one dim to nothing.
      m.opacity = Math.max(0.04, alpha * (0.62 - i * built.fall)) * fade;
    }
  });
  return (
    <>
      <primitive object={built.group} />
      <primitive object={built.trail} />
    </>
  );
}

// ---- clock: the single source of animation time -----------------------------
// Mounted first so it advances t before any consumer reads it this frame.
function ClockDriver({ ctl }: { ctl: HeroCtl }) {
  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05); // clamp after a tab blur
    if (ctl.resetRef.current) {
      ctl.tRef.current = 0;
      ctl.resetRef.current = false;
      ctl.playingRef.current = true;
    }
    if (ctl.stepRef.current !== 0) {
      ctl.tRef.current = Math.max(0, ctl.tRef.current + ctl.stepRef.current);
      ctl.stepRef.current = 0;
      ctl.playingRef.current = false; // stepping implies pause
    }
    // Ease the hero's own layers toward present/absent. Computed once here
    // rather than in each consumer so every element leaves together.
    //
    // LINEAR, not exponential. An exponential ease is fast then slow by
    // definition, so it dims hard, then trails off for another second, and the
    // long tail is what reads as a second stage rather than one dim. A fixed
    // rate covers the whole range in FADE_SECS no matter which way it is going.
    // The scroll dim. This is the BLOOM's now, not the hero's: the hero scrolls
    // away under the rig above, and a thing that leaves the screen does not
    // need to dissolve as well. What is left for this to do is take the glow
    // off the starfield and switch the expensive pass out once the page has
    // moved on from the hero.
    const want = ctl.pastRef.current ? 0 : 1;
    const f = ctl.bloomFadeRef.current;
    const step = d / FADE_SECS;
    ctl.bloomFadeRef.current = want > f ? Math.min(want, f + step) : Math.max(want, f - step);

    // The abort, on its own clock. Ending the animatic early is a different
    // event from scrolling past it: it goes out faster, over SKIP_SECS, and it
    // comes back on the slow rate so that returning to a hero that was skipped
    // is not a snap.
    const wantA = ctl.skipRef.current ? 0 : 1;
    const a = ctl.abortRef.current;
    const stepA = d / (ctl.skipRef.current ? SKIP_SECS : FADE_SECS);
    ctl.abortRef.current = wantA > a ? Math.min(wantA, a + stepA) : Math.max(wantA, a - stepA);

    if (ctl.scrubRef.current != null) {
      ctl.tRef.current = ctl.scrubRef.current;
    } else if (ctl.playingRef.current) {
      // Stretch the pull/tunnel/eject ~2x so the ejection reads slow, then ramp
      // back to real-time by the break. Everything downstream is keyed to t, so
      // no other timing changes -- the intro just takes longer in real seconds.
      const rate = 0.5 + 0.5 * smooth(2.0, 2.6, ctl.tRef.current);
      ctl.tRef.current += d * rate;
    }
  });
  return null;
}

// ---- HUD driver: writes the DOM overlay from the same clock ------------------
// Deterministic noise. The glitch has to be a pure function of t like every
// other part of this scene: Math.random would resolve differently on every
// frame and, worse, scrubbing backward would show a different glitch than
// playing forward through the same moment.
function hash(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}
// The order the wordmark's characters commit in. Scrambled, not left-to-right,
// so it reads as a signal locking in rather than as a second typing effect.
const MARK_RANK: number[] = (() => {
  const n = MARK_TEXT.length;
  const seq = Array.from({ length: n }, (_, i) => i).sort((a, b) => hash(a, 1) - hash(b, 1));
  const rank = new Array<number>(n);
  seq.forEach((charIndex, k) => {
    rank[charIndex] = k;
  });
  return rank;
})();

function HudDriver({ ctl, hud }: { ctl: HeroCtl; hud: HeroHud }) {
  // Cached child lookups + the last state written, so the per-character work
  // only touches the DOM when something actually changed.
  const saidChars = useRef<HTMLElement[] | null>(null);
  const markChars = useRef<HTMLElement[] | null>(null);
  const enterLabs = useRef<{ lab: HTMLElement; skip: HTMLElement } | null>(null);
  const lastTyped = useRef(-1);
  const announced = useRef(false);
  const released = useRef(false);
  useFrame((state) => {
    // Tells the boot script the scene really started. That script hides the
    // hero so the animation can play, and releases it again if this never
    // fires, so a browser with no WebGL gets the settled hero rather than a
    // blank frame. Set from the driver's first frame because the driver is
    // what actually takes ownership of the opacities below.
    if (!announced.current) {
      announced.current = true;
      document.documentElement.setAttribute("data-ha-running", "1");
    }
    const t = heroT(state.clock.elapsedTime, ctl);
    const td = Math.min(t, DUR);
    if (hud.beatRef.current) hud.beatRef.current.textContent = beatName(td);
    if (hud.tcRef.current) hud.tcRef.current.textContent = td.toFixed(2) + "s";
    const flood = smooth(2.2, 2.35, t) * (1 - smooth(2.45, 3.0, t)); // a quick flash, then it clears for the spiral
    if (hud.floodRef.current) hud.floodRef.current.style.opacity = String(flood);
    // The overlay is pure f(t) and scrolls off with the stage, which is all it
    // ever needed to do. The one thing it cannot handle on its own is the
    // abort: SKIP ends the animatic where it stands, with the page still held,
    // so the shapes dissolve and text that ignored that would be the one thing
    // left hanging in an empty frame. Hence the abort, and only the abort.
    const fade = ctl.abortRef.current;
    const live = fade > 0.02; // nothing invisible stays clickable
    const doorsIn = smooth(5.0, 5.75, t);
    if (hud.doorsRef.current) {
      hud.doorsRef.current.style.opacity = String(doorsIn * fade);
      hud.doorsRef.current.style.pointerEvents = t > 5.3 && live ? "auto" : "none";
    }
    // THE WAY OUT, on its own clock. It arrives at half strength during THE
    // PULL and comes up to full on the menu's curve, so the escape from the
    // scroll lock exists from about a second in without a second element
    // competing with the doors once they land. Clickable as soon as it is
    // visible: it is the only way past the lock and it must never be a target
    // you can see but not hit.
    if (hud.enterRef.current) {
      const enter = hud.enterRef.current;
      const early = smooth(ENTER_IN, ENTER_OUT, t);
      enter.style.opacity = String((ENTER_DIM * early + (1 - ENTER_DIM) * doorsIn) * fade);
      enter.style.pointerEvents = t > ENTER_IN && live ? "auto" : "none";
      // And it stops calling itself a skip once there is nothing left to skip.
      // A crossfade in a single grid cell, not a textContent swap: the two
      // words are different widths, and rewriting the label would jump a
      // centred control sideways in the middle of its own transition. Both
      // spans are laid out from the first frame and only their opacity moves.
      if (!enterLabs.current) {
        enterLabs.current = {
          lab: enter.querySelector<HTMLElement>(".ha-enter__lab")!,
          skip: enter.querySelector<HTMLElement>(".ha-enter__skip")!,
        };
      }
      const said = smooth(MARK_OUT, DUR, t);
      enterLabs.current.lab.style.opacity = String(said);
      enterLabs.current.skip.style.opacity = String(1 - said);
    }
    // THE LOCK RELEASES ITSELF. The page holds still until the last element of
    // the animatic has settled, which is the wordmark, not DUR: the beat runs
    // 0.55s past the point where nothing is moving any more. Written once, and
    // from here rather than from an effect, because this driver is the only
    // thing that knows where the clock actually is. Removing a class that was
    // never added (the lab, reduced motion, a page that loaded scrolled) is a
    // no-op, so this needs no guard beyond the once-only flag.
    if (!released.current && t >= MARK_OUT) {
      released.current = true;
      document.documentElement.classList.remove("ha-lock");
    }
    // THE ADDRESS: the line TYPES in, character by character, at a linear rate.
    // Linear on purpose -- an eased curve would make a typewriter accelerate and
    // brake, which no terminal does. The whole line is laid out from the first
    // frame and characters only toggle opacity, so nothing reflows as it types.
    const el = hud.titleRef.current;
    if (el) {
      if (!saidChars.current) {
        saidChars.current = Array.from(el.querySelectorAll<HTMLElement>(".ha-c"));
      }
      el.style.opacity = String((t >= SAID_IN ? 1 : 0) * fade);
      const chars = saidChars.current;
      const p = clamp((t - SAID_IN) / (SAID_OUT - SAID_IN), 0, 1);
      const typed = Math.round(p * chars.length);
      if (typed !== lastTyped.current) {
        // The caret retires the moment the last character lands. Leaving it on
        // would blink through the wordmark's whole entrance and then forever in
        // the idle, reading as a stray artifact rather than as typing.
        const caretAt = typed < chars.length ? typed - 1 : -1;
        for (let i = 0; i < chars.length; i++) {
          const on = i < typed;
          chars[i].className = on ? (i === caretAt ? "ha-c is-on is-frontier" : "ha-c is-on") : "ha-c";
        }
        lastTyped.current = typed;
      }
    }

    // THE NAME: the wordmark glitches in LAST, over a full 3s, after the line
    // has finished typing. Characters commit in a scrambled order; until one
    // settles it drops out and jitters, and the whole mark carries a chromatic
    // split that closes as it locks. Transform-only jitter, so a centred nowrap
    // wordmark cannot shimmy sideways while it resolves.
    const mk = hud.markRef.current;
    if (mk) {
      if (!markChars.current) {
        markChars.current = Array.from(mk.querySelectorAll<HTMLElement>(".ha-m"));
      }
      const g = clamp((t - MARK_IN) / (MARK_OUT - MARK_IN), 0, 1);
      mk.style.opacity = String(smooth(0, 1, g) * 0.05 * fade);
      const sp = ((1 - g) * 5).toFixed(2);
      mk.style.textShadow = g >= 1 ? "none" : "-" + sp + "px 0 #ff2e63, " + sp + "px 0 #00e0ff";
      const chars = markChars.current;
      const bucket = Math.floor(t * 18); // the glitch re-rolls 18x a second
      for (let i = 0; i < chars.length; i++) {
        // Committed by 63% of the window, then each character settles over the
        // next 30% -- so the last one to arrive still gets time to stabilise.
        const gOn = 0.06 + (MARK_RANK[i] / chars.length) * 0.57;
        const settle = clamp((g - gOn) / 0.3, 0, 1);
        if (g < gOn) {
          chars[i].style.opacity = "0";
          continue;
        }
        const unstable = 1 - settle;
        const drop = hash(i, bucket) < 0.3 * unstable; // blinks out while unstable
        chars[i].style.opacity = drop ? "0" : "1";
        const jx = (hash(i, bucket + 7) - 0.5) * 12 * unstable;
        const jy = (hash(i, bucket + 13) - 0.5) * 7 * unstable;
        chars[i].style.transform = settle >= 1 ? "none" : "translate(" + jx.toFixed(2) + "px," + jy.toFixed(2) + "px)";
      }
    }
    if (hud.scrubEl.current && ctl.scrubRef.current == null) {
      hud.scrubEl.current.value = String(Math.round(td * 100));
      hud.scrubEl.current.style.setProperty("--p", (td / DUR) * 100 + "%");
    }
    if (hud.playBtnRef.current) {
      hud.playBtnRef.current.textContent = ctl.playingRef.current ? "❚❚" : "▶";
    }
  });
  return null;
}

// ---- scene ------------------------------------------------------------------
// THE SKY IS ONE THING, AND IT NEVER MOVES.
//
// Three ways to build the same scene file, because the homepage draws it across
// two canvases and the lab draws it in one:
//
//   cosmos  the sky, alone, in a canvas fixed to the viewport. It is behind
//           everything, all the time, and it is the ONLY copy of the starfield
//           and the nebula on the homepage.
//   hero    everything the animatic owns and nothing else, in a canvas that
//           sits in the page and scrolls with it. No sky and no background
//           fill: it is transparent, and the fixed cosmos above shows straight
//           through it. Drawing its own sky is what made the backdrop scroll
//           away with the hero, which is the one thing the backdrop must never
//           do.
//   full    both at once, opaque, for the lab, where there is only one canvas
//           and nothing behind it to show through.
//
// The split exists because a canvas pinned to the viewport can only move what
// it draws by drawing it again, so the shapes lagged the page by however long a
// frame took. An element in normal flow is moved by the browser at any frame
// rate, for free. So the thing that must scroll is in the page and the thing
// that must not is pinned, and neither one has to fake it.
//
// The clock lives with the hero and the cosmos only reads it, so the two
// canvases cannot drift: one t, one camera, one set of constants.
function HeroScene({
  ctl,
  hud,
  mode,
}: {
  ctl: HeroCtl;
  hud: HeroHud;
  mode: "full" | "hero" | "cosmos";
}) {
  const sky = mode !== "hero";
  const stage = mode !== "cosmos";
  return (
    <>
      {/* The void is painted by whichever canvas is at the back. On the
          homepage that is the cosmos; the hero canvas must stay transparent or
          it would paint over the sky it is supposed to be standing in. */}
      {sky && <color attach="background" args={[COL_VOID]} />}
      <fogExp2 attach="fog" args={[COL_VOID, FOG_DENSITY]} />
      {stage && <ClockDriver ctl={ctl} />}
      <CameraRig ctl={ctl} />
      {sky && (
        <>
          <Starfield ctl={ctl} />
          <Nebula ctl={ctl} />
        </>
      )}
      {stage && (
        <>
          <MachineField ctl={ctl} />
          <WarpCore ctl={ctl} />
          <RushStreaks ctl={ctl} />
          <BreakShards ctl={ctl} />
          {DOORS.map((d, i) => (
            <HeroShape key={d.key} door={d} index={i} ctl={ctl} />
          ))}
          <HudDriver ctl={ctl} hud={hud} />
        </>
      )}
      <HeroBloom ctl={ctl} />
    </>
  );
}

// The scene is decorative: every word it carries lives in the DOM overlay as
// real text, so it is hidden from assistive tech. A screen reader goes straight
// to the heading and the menu rather than waiting out an animation it cannot
// see. The camera reads the shared constants because heroLayout projects the
// DOM labels through the same numbers; two copies of the fov is precisely the
// drift that put the labels off their shapes in the first place.
export default function HeroCanvas({
  ctl,
  hud,
  frameloop = "always",
  mode = "full",
}: {
  ctl: HeroCtl;
  hud: HeroHud;
  frameloop?: "always" | "demand" | "never";
  // "hero" is the animatic alone, transparent, in the page and scrolling with
  // it. "cosmos" is the sky alone, opaque, fixed behind the whole page. "full"
  // is both in one opaque canvas, which is the lab.
  mode?: "full" | "hero" | "cosmos";
}) {
  // Pixel-ratio ceiling. This module is client-only (ssr:false), so window is
  // always here. At [1,2] on a 390x844 phone with a 3x screen the scene renders
  // a 780x1688 buffer and then runs a multi-pass bloom over it, which was
  // acceptable on a preview route nothing linked to and is not acceptable as
  // the first paint of the homepage on a phone.
  const dpr = useMemo<[number, number]>(
    () => (Math.min(window.innerWidth, window.innerHeight) < 700 ? [1, 1.5] : [1, 2]),
    [],
  );
  return (
    <Canvas
      flat
      aria-hidden="true"
      frameloop={frameloop}
      camera={{ fov: CAM_FOV, near: 0.1, far: 400, position: [0, 0, CAM_Z_REST] }}
      // alpha explicitly, not by default: the hero canvas has to be see-through
      // or the fixed sky behind it is wasted work nobody can see.
      gl={{ antialias: true, alpha: true }}
      dpr={dpr}
    >
      <HeroScene ctl={ctl} hud={hud} mode={mode} />
    </Canvas>
  );
}
