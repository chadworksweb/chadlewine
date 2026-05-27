"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export interface PillarSongView {
  id: string;
  slug: string;
  title: string;
  line: string | null;
  art: string | null;
  alt: string | null;
}

// Each pillar is GPU-built from its song's cover art: the image is fragmented
// and distorted into a fluted classical column, then pushed through an LCD
// dot-matrix pass (chunky art-pixels made of R/G/B subpixels, grid gaps,
// scanlines, a cool backlight). One shared WebGL context draws every column;
// per-column viewport/scissor keeps each shader column locked to its DOM cell,
// so the grid stays responsive and the text/links remain real DOM on top.

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main(){
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uTime;
uniform float uHover;
uniform float uHasTex;
uniform float uSeed;
uniform vec2 uCells;
uniform float uAspect;
#define TAU 6.28318530718

float rand(float n){ return fract(sin(n * 12.9898 + uSeed * 7.13) * 43758.5453); }

// Column silhouette: half-width as a function of height (0 = base, 1 = capital).
float hwFn(float y){
  float shaft = 0.27 + 0.018 * sin(y * 3.14159);      // gentle entasis bulge
  float base  = mix(0.45, shaft, smoothstep(0.0, 0.12, y));
  float cap   = mix(shaft, 0.41, smoothstep(0.85, 1.0, y));
  float hw = shaft;
  hw = mix(base, hw, smoothstep(0.05, 0.14, y));
  hw = mix(hw, cap, smoothstep(0.83, 0.92, y));
  if (y > 0.955) hw = 0.45;   // abacus slab
  if (y < 0.045) hw = 0.47;   // plinth slab
  return hw;
}

void main(){
  float y = vUv.y;
  float hw = hwFn(y);
  float dx = abs(vUv.x - 0.5);
  float edge = 0.006;
  float mask = 1.0 - smoothstep(hw - edge, hw + edge, dx);
  if (mask < 0.01) discard;

  // Normalize x across the column width so the art wraps the shaft.
  float nx = (vUv.x - 0.5) / max(hw, 0.001) * 0.5 + 0.5;

  // Fragment the art: break the column into vertical segments, each sampling a
  // shifted slice — abstraction, not a flat stretch.
  float segs = 6.0;
  float seg = floor(y * segs);
  float shx = (rand(seg) - 0.5) * 0.5;
  float shy = (rand(seg + 19.0) - 0.5) * 0.18;
  float flutes = 7.0;
  nx += sin(nx * flutes * TAU) * 0.012;            // fluting ripple in the art
  vec2 auv = vec2(fract(nx + shx), fract((1.0 - y) + shy));

  // LCD pixelation — art broken into chunky cells. On hover the background
  // clears up partway (finer cells), but never fully resolves.
  vec2 cells = mix(uCells, uCells * 1.6, uHover);

  // --- Kinetic electric glitch (hover only). A band of energy sweeps through
  // the column and sparks intermittently, like a live wire / sparking chip. ---
  float gAmt = 0.0;
  if (uHover > 0.001) {
    float tt = uTime;
    float slot = floor(tt * 2.04);                               // ~15% slower cadence
    float fire = step(0.9, fract(sin(slot * 91.7 + uSeed * 13.0) * 43758.5453)); // sparser
    float burst = fire * (0.55 + 0.45 * sin(tt * 110.0));        // a spark every several seconds
    // Travelling scanline: slower, and only on every other cycle (skip one).
    float swCycle = floor(tt * 0.3);
    float swOn = mod(swCycle, 2.0);
    float sweep = swOn * smoothstep(0.08, 0.0, abs((1.0 - y) - fract(tt * 0.3)));
    gAmt = uHover * clamp(burst * 0.9 + sweep * 0.5, 0.0, 1.0);
    // Jump random horizontal bands sideways (datamosh slices).
    float band = floor((1.0 - y) * 26.0);
    float br = fract(sin(band * 45.3 + slot * 7.7 + uSeed) * 43758.5453);
    auv.x = fract(auv.x + (br - 0.5) * 0.14 * gAmt * step(0.55, br));
  }

  vec2 puv = (floor(auv * cells) + 0.5) / cells;

  vec3 col;
  if (uHasTex > 0.5) {
    col = texture2D(uTex, puv).rgb;
    // Chromatic RGB split during the glitch — electric colour fringing.
    if (gAmt > 0.001) {
      float o = 0.02 * gAmt;
      col.r = texture2D(uTex, (floor(vec2(auv.x + o, auv.y) * cells) + 0.5) / cells).r;
      col.b = texture2D(uTex, (floor(vec2(auv.x - o, auv.y) * cells) + 0.5) / cells).b;
    }
  } else {
    col = vec3(0.28, 0.32, 0.42) + 0.12 * rand(floor(auv.y * cells.y));
  }

  // Posterize for the retro panel look — eases up partway on hover.
  float levels = mix(6.0, 9.0, uHover);
  col = floor(col * levels) / levels;

  // Cylindrical + flute groove shading so the flat art reads as round stone.
  float groove = 0.78 + 0.22 * abs(sin(nx * flutes * TAU));
  float cyl = 1.0 - 0.5 * pow(dx / max(hw, 0.001), 2.0);
  col *= groove * (0.62 + 0.38 * cyl);

  // Lift the art so the panel reads as lit, not a dim photo behind glass.
  col = col * 1.3 + 0.05;

  // Hover: a ratio-correct, un-pixelated copy of the cover art materialises
  // dead-centre. It overrides only this square — the pixelated background column
  // is left untouched — and the scanline filter still passes over it. uAspect
  // (cell w/h) keeps the square reading square on screen.
  float sq = 0.0;
  if (uHover > 0.001 && uHasTex > 0.5) {
    float halfX = 0.24;
    float halfY = halfX * uAspect;
    vec2 d = abs(vUv - 0.5);
    float fx = 0.012;
    sq = (1.0 - smoothstep(halfX - fx, halfX + fx, d.x)) *
         (1.0 - smoothstep(halfY - fx, halfY + fx, d.y)) * uHover;
    vec2 quv = vec2(
      (vUv.x - 0.5) / halfX * 0.5 + 0.5,
      1.0 - ((vUv.y - 0.5) / halfY * 0.5 + 0.5)
    );
    vec3 clearC = clamp(texture2D(uTex, clamp(quv, 0.0, 1.0)).rgb * 1.12 + 0.02, 0.0, 1.5);
    col = mix(col, clearC, sq);
  }

  // RGB subpixel mask: split each art-pixel cell into R / G / B thirds. Eased
  // toward clear inside the resolved square so the copy stays sharp.
  vec2 pg = auv * cells;
  float cx = fract(pg.x);
  vec3 sp = vec3(
    step(cx, 1.0 / 3.0),
    step(1.0 / 3.0, cx) * step(cx, 2.0 / 3.0),
    step(2.0 / 3.0, cx)
  );
  vec3 spMask = (vec3(0.45) + sp * 0.8) * 1.5;
  spMask = mix(spMask, vec3(1.0), sq * 0.8);
  col *= spMask;

  // Dot-matrix grid gaps between cells — eased inside the square.
  vec2 g = abs(fract(pg) - 0.5) * 2.0;
  float gap = (1.0 - smoothstep(0.82, 0.99, g.x)) * (1.0 - smoothstep(0.84, 0.99, g.y));
  gap = mix(gap, 1.0, sq * 0.9);
  col *= mix(0.55, 1.0, gap);

  // Drifting scanline (stays over the square) + cool backlight.
  float scan = 0.92 + 0.08 * sin((auv.y * cells.y + uTime * 0.6) * TAU);
  col *= scan;
  col += vec3(0.03, 0.04, 0.07);

  // Edge rim — a scribed line of light around the silhouette.
  float rim = smoothstep(hw - 0.022, hw, dx) * mask;
  col += rim * vec3(0.5, 0.55, 0.7) * 0.55;

  // Electric sparks: brief blue-white scanlines + a faint power flicker.
  if (gAmt > 0.001) {
    float sl = step(0.992, fract(sin(floor((1.0 - y) * 130.0) * 12.9 + floor(uTime * 45.0) * 3.7 + uSeed) * 43758.5453));
    col += sl * gAmt * vec3(0.5, 0.75, 1.0);
    col += rim * gAmt * vec3(0.3, 0.5, 0.9);          // edges spark hot
    col *= 1.0 + 0.16 * gAmt * sin(uTime * 80.0 + uSeed);
  }

  gl_FragColor = vec4(col, mask);
}`;

// Mirror of the shader's hwFn so the pointer can be hit-tested against the
// actual column silhouette (not the rectangular cell). y: 0 = base, 1 = top.
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function columnHalfWidth(y: number) {
  const shaft = 0.27 + 0.018 * Math.sin(y * Math.PI);
  const base = lerp(0.45, shaft, smoothstep(0, 0.12, y));
  const cap = lerp(shaft, 0.41, smoothstep(0.85, 1, y));
  let hw = shaft;
  hw = lerp(base, hw, smoothstep(0.05, 0.14, y));
  hw = lerp(hw, cap, smoothstep(0.83, 0.92, y));
  if (y > 0.955) hw = 0.45;
  if (y < 0.045) hw = 0.47;
  return hw;
}

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || "shader compile failed");
  }
  return sh;
}

export function PillarColonnade({ songs }: { songs: PillarSongView[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const hoverRef = useRef<Float32Array>(new Float32Array(songs.length));
  const hoverCurRef = useRef<Float32Array>(new Float32Array(songs.length));
  // Index of the column the pointer is currently over (silhouette, not box).
  const hotRef = useRef<number>(-1);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const gl = (canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: false }) ||
      canvas.getContext("experimental-webgl", { alpha: true, premultipliedAlpha: false })) as WebGLRenderingContext | null;
    if (!gl) return; // CSS fallback (.pillar-col__fallback) stays visible

    container.classList.add("is-gl");

    let program: WebGLProgram;
    try {
      program = gl.createProgram()!;
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("link failed");
    } catch {
      container.classList.remove("is-gl");
      return;
    }
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = {
      time: gl.getUniformLocation(program, "uTime"),
      hover: gl.getUniformLocation(program, "uHover"),
      hasTex: gl.getUniformLocation(program, "uHasTex"),
      seed: gl.getUniformLocation(program, "uSeed"),
      cells: gl.getUniformLocation(program, "uCells"),
      aspect: gl.getUniformLocation(program, "uAspect"),
    };
    gl.uniform2f(u.cells, 16.0, 46.0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Textures, loaded async; missing art renders as a procedural stone column.
    const textures: (WebGLTexture | null)[] = songs.map(() => null);
    songs.forEach((s, i) => {
      if (!s.art) return;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          textures[i] = tex;
        } catch {
          /* tainted/decode issue — leaves procedural fallback for this column */
        }
      };
      img.src = s.art;
    });

    type Rect = { x: number; y: number; w: number; h: number };
    let rects: Rect[] = [];
    let plateRects: (Rect | null)[] = [];
    let dpr = 1;
    function measure() {
      if (!container || !canvas) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cb = container.getBoundingClientRect();
      canvas.width = Math.round(cb.width * dpr);
      canvas.height = Math.round(cb.height * dpr);
      rects = colRefs.current.map((el) => {
        if (!el) return { x: 0, y: 0, w: 0, h: 0 };
        const r = el.getBoundingClientRect();
        return { x: r.left - cb.left, y: r.top - cb.top, w: r.width, h: r.height };
      });
      plateRects = colRefs.current.map((el) => {
        const p = el?.querySelector(".pillar-col__plate");
        if (!p) return null;
        const r = p.getBoundingClientRect();
        return { x: r.left - cb.left, y: r.top - cb.top, w: r.width, h: r.height };
      });
    }
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(container);

    // Hover only counts when the pointer is over the actual column silhouette
    // (mirrored from columnHalfWidth) — not the cell box, not the title plate.
    let hot = -1;
    function setHot(idx: number) {
      if (idx === hot) return;
      const els = colRefs.current;
      if (hot >= 0 && els[hot]) els[hot]!.classList.remove("is-hot");
      if (idx >= 0 && els[idx]) els[idx]!.classList.add("is-hot");
      for (let i = 0; i < songs.length; i++) hoverRef.current[i] = i === idx ? 1 : 0;
      hot = idx;
      hotRef.current = idx;
    }
    function onMove(e: PointerEvent) {
      if (!container) return;
      const cb = container.getBoundingClientRect();
      const px = e.clientX - cb.left;
      const py = e.clientY - cb.top;
      let found = -1;
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (!r || !r.w) continue;
        if (px < r.x || px > r.x + r.w || py < r.y || py > r.y + r.h) continue;
        const pr = plateRects[i];
        const onPlate = pr && px >= pr.x && px <= pr.x + pr.w && py >= pr.y && py <= pr.y + pr.h;
        if (!onPlate) {
          const cellX = (px - r.x) / r.w;
          const yy = 1 - (py - r.y) / r.h;
          if (Math.abs(cellX - 0.5) < columnHalfWidth(yy)) found = i;
        }
        break;
      }
      setHot(found);
    }
    function onLeave() { setHot(-1); }
    container.addEventListener("pointermove", onMove);
    container.addEventListener("pointerleave", onLeave);

    let raf = 0;
    const start = performance.now();
    function frame(now: number) {
      if (!gl || !canvas) return;
      const t = (now - start) / 1000;
      const hov = hoverRef.current;
      const cur = hoverCurRef.current;

      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.SCISSOR_TEST);

      gl.uniform1f(u.time, t);
      const H = canvas.height;
      for (let i = 0; i < songs.length; i++) {
        const r = rects[i];
        if (!r || r.w === 0) continue;
        cur[i] += (hov[i] - cur[i]) * 0.12;
        const x = Math.round(r.x * dpr);
        const w = Math.round(r.w * dpr);
        const h = Math.round(r.h * dpr);
        const vy = H - Math.round((r.y + r.h) * dpr);
        gl.viewport(x, vy, w, h);
        gl.scissor(x, vy, w, h);
        gl.uniform1f(u.hover, cur[i]);
        gl.uniform1f(u.seed, i * 1.618);
        gl.uniform1f(u.aspect, w / h);
        const tex = textures[i];
        gl.uniform1f(u.hasTex, tex ? 1 : 0);
        if (tex) {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, tex);
        }
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    const onVis = () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else raf = requestAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      container.removeEventListener("pointermove", onMove);
      container.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVis);
      container.classList.remove("is-gl");
    };
  }, [songs]);

  return (
    <div className="pillar-colonnade" ref={containerRef}>
      <canvas className="pillar-colonnade__lcd" ref={canvasRef} aria-hidden="true" />
      {songs.map((s, i) => (
        <Link
          key={s.id}
          href={`/music/songs/${s.slug}`}
          className="pillar-col"
          ref={(el) => { colRefs.current[i] = el; }}
          onFocus={(e) => { hoverRef.current[i] = 1; e.currentTarget.classList.add("is-hot"); }}
          onBlur={(e) => { hoverRef.current[i] = 0; e.currentTarget.classList.remove("is-hot"); }}
          onClick={(e) => {
            // Only the column silhouette is clickable. Allow keyboard activation
            // (detail === 0); for pointer clicks, require the cursor to be on
            // the column (hotRef), not the side wedges or the title plate.
            if (e.detail !== 0 && hotRef.current !== i) e.preventDefault();
          }}
          style={s.art ? ({ "--art": `url(${s.art})` } as React.CSSProperties) : undefined}
        >
          <span className="pillar-col__fallback" aria-hidden="true" />
          <span className="pillar-col__plate">
            <span className="pillar-col__title">{s.title}</span>
            {s.line && <span className="pillar-col__note">{s.line}</span>}
            <span className="pillar-col__cta">Enter &rarr;</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
