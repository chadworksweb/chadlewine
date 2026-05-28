"use client";

import { useEffect, useRef } from "react";

// Backdrop for the /merch controls bar: a random published release cover
// (.webp only, filtered server-side) treated with the same LCD dot-matrix /
// posterize / RGB-subpixel-mask / scanline-drift treatment the pillar-songs
// PillarColonnade applies inside each column. Flat rectangle here, no
// silhouette mask. The random pick happens on mount, so each page load can
// land on a different cover.

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
uniform float uHasTex;
uniform float uTime;
uniform vec2 uCells;
uniform float uSeed;
#define TAU 6.28318530718

float rand(float n){ return fract(sin(n * 12.9898 + uSeed * 7.13) * 43758.5453); }

void main(){
  vec2 uv = vUv;

  // Center-crop: the cover is square, the bar is wide and short. Sample the
  // middle horizontal band of the cover and stretch it across the bar so the
  // image stays recognizable instead of being a thin slice.
  float texY = 0.5 + (uv.y - 0.5) * 0.42;
  vec2 auv = vec2(uv.x, texY);

  // Fragmentation: split the bar into vertical segments and slightly shift
  // each segment's sampling -- same trick used in the pillar shader, here
  // along x. Subtle ambient time drift so the segments breathe.
  float segs = 8.0;
  float seg = floor(uv.x * segs);
  float shx = (rand(seg) - 0.5) * 0.05;
  float shy = (rand(seg + 19.0) - 0.5) * 0.04;
  auv.x = fract(auv.x + shx + sin(uTime * 0.15 + seg) * 0.002);
  auv.y = fract(auv.y + shy);

  // LCD pixelation: chunky cells.
  vec2 puv = (floor(auv * uCells) + 0.5) / uCells;

  vec3 col;
  if (uHasTex > 0.5) {
    col = texture2D(uTex, puv).rgb;
    // Subtle ambient chromatic split (always on, very small).
    float o = 0.004 + 0.002 * sin(uTime * 0.6);
    col.r = texture2D(uTex, (floor(vec2(auv.x + o, auv.y) * uCells) + 0.5) / uCells).r;
    col.b = texture2D(uTex, (floor(vec2(auv.x - o, auv.y) * uCells) + 0.5) / uCells).b;
  } else {
    col = vec3(0.10, 0.12, 0.18);
  }

  // Posterize for the retro panel look.
  float levels = 6.0;
  col = floor(col * levels) / levels;

  // Lift the art a touch so it doesn't read as dim glass.
  col = col * 1.15 + 0.03;

  // RGB subpixel mask: each LCD cell is split into R/G/B thirds.
  vec2 pg = auv * uCells;
  float cx = fract(pg.x);
  vec3 sp = vec3(
    step(cx, 1.0 / 3.0),
    step(1.0 / 3.0, cx) * step(cx, 2.0 / 3.0),
    step(2.0 / 3.0, cx)
  );
  vec3 spMask = (vec3(0.45) + sp * 0.8) * 1.4;
  col *= spMask;

  // Dot-matrix grid gaps between cells.
  vec2 g = abs(fract(pg) - 0.5) * 2.0;
  float gap = (1.0 - smoothstep(0.82, 0.99, g.x)) * (1.0 - smoothstep(0.82, 0.99, g.y));
  col *= mix(0.55, 1.0, gap);

  // Scanline drift + cool backlight.
  float scan = 0.92 + 0.08 * sin((auv.y * uCells.y + uTime * 0.6) * TAU);
  col *= scan;
  col += vec3(0.03, 0.04, 0.07);

  // Soft horizontal vignette so the bar breathes at the edges.
  float vx = smoothstep(0.0, 0.06, uv.x) * smoothstep(0.0, 0.06, 1.0 - uv.x);
  col *= mix(0.70, 1.0, vx);

  // Mute the whole panel so the chips and sort dropdown stay legible on top.
  col *= 0.62;

  gl_FragColor = vec4(col, 1.0);
}`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || "shader compile failed");
  }
  return sh;
}

interface Props {
  covers: string[];
}

export function MerchShopBackdrop({ covers }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || covers.length === 0) return;
    const gl = (canvas.getContext("webgl", { alpha: true, antialias: false }) ||
      canvas.getContext("experimental-webgl", { alpha: true })) as WebGLRenderingContext | null;
    if (!gl) return;

    let program: WebGLProgram;
    try {
      program = gl.createProgram()!;
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("link failed");
    } catch {
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
      cells: gl.getUniformLocation(program, "uCells"),
      hasTex: gl.getUniformLocation(program, "uHasTex"),
      seed: gl.getUniformLocation(program, "uSeed"),
    };
    gl.uniform2f(u.cells, 80.0, 16.0);
    gl.uniform1f(u.hasTex, 0);
    gl.uniform1f(u.seed, Math.random() * 100);

    // Pick a random cover per mount.
    const pick = covers[Math.floor(Math.random() * covers.length)];
    let texture: WebGLTexture | null = null;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!gl) return;
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        gl.uniform1f(u.hasTex, 1);
      } catch {
        gl.uniform1f(u.hasTex, 0);
      }
    };
    img.src = pick;

    let dpr = 1;
    function measure() {
      if (!canvas || !gl) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      // Cells scale with width so cell size stays roughly constant on screen.
      const cellsX = Math.max(40, Math.round(r.width / 14));
      const cellsY = Math.max(10, Math.round(r.height / 4));
      gl.uniform2f(u.cells, cellsX, cellsY);
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(canvas);

    let raf = 0;
    const start = performance.now();
    function frame(now: number) {
      if (!gl) return;
      const t = (now - start) / 1000;
      gl.uniform1f(u.time, t);
      if (texture) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 6);
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
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [covers]);

  if (covers.length === 0) return null;
  return <canvas className="merch-shop__backdrop" ref={canvasRef} aria-hidden="true" />;
}
