"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { CSSProperties } from "react";

// Analytic radial-ripple shader. Each click spawns an independent expanding
// ring; the shader sums all active rings into a heightfield and refracts the
// source image. No PDE, no reflections, no interference past the visible
// shell. To revert this surface back to the wave-equation sim, swap the
// import in MerchExploreGrid back to DiscoFaceWater. Same handle interface.

export interface MerchRippleCanvasHandle {
  drop: (xPct: number, yPct: number, strength?: number) => void;
}

interface Props {
  src: string;
  className?: string;
  style?: CSSProperties;
}

// Max active rings in the shader at once. Together with DROP_GAP_PX in the
// grid orchestrator this caps the length of the cursor trail. Larger = the
// trail can extend further behind the cursor before the oldest drop is
// evicted on each new insertion.
const MAX_DROPS = 28;
// Wave propagation speed in normalized canvas units per second. Lower = the
// ring expands more slowly across the card. ~0.3 means the ring takes
// roughly 3.3s to cross the canvas.
const SPEED = 0.3;
// Spatial frequency of the wave inside the shell (cycles per canvas unit).
// Higher = more ripples crammed in. Lower = more space between rings.
const FREQ = 38.0;
// Asymmetric shell: SHELL_LEAD is the Gaussian sigma ahead of the wavefront
// (sharp leading edge), SHELL_TRAIL is the sigma behind it (long trail that
// keeps the inner end anchored to the cursor as the wavefront expands).
const SHELL_LEAD = 0.022;
const SHELL_TRAIL = 0.16;
// How long a ring stays in the shader pool. Anything past this returns 0.
// Needs to be >= 1/SPEED so the ring reaches the edge before fading.
const LIFETIME_S = 3.5;
// Refraction strength when sampling the source image.
const DISPLACEMENT = 0.032;

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
uniform sampler2D u_source;
uniform vec4 u_crop;
uniform vec4 u_drops[${MAX_DROPS}];
uniform float u_time;
uniform float u_speed;
uniform float u_freq;
uniform float u_lifetime;
uniform float u_shellLead;
uniform float u_shellTrail;
uniform float u_disp;
out vec4 outColor;

float ring(vec2 p, vec4 drop) {
  if (drop.w <= 0.0) return 0.0;
  float age = u_time - drop.z;
  if (age < 0.0 || age > u_lifetime) return 0.0;
  float r = distance(p, drop.xy);
  float wavefront = age * u_speed;
  float dr = r - wavefront;
  // Asymmetric shell: sharp leading edge ahead of wavefront, long trailing
  // edge behind it back toward the cursor. This keeps ripples anchored to
  // the drop point as the wavefront expands outward.
  float sig = (dr > 0.0) ? u_shellLead : u_shellTrail;
  float shell = exp(-dr * dr / (sig * sig));
  float wave = sin(dr * u_freq);
  float fade = 1.0 - age / u_lifetime;
  return drop.w * shell * wave * fade * fade;
}

float field(vec2 p) {
  float h = 0.0;
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    h += ring(p, u_drops[i]);
  }
  return h;
}

void main() {
  float eps = 0.0025;
  float hl = field(v_uv - vec2(eps, 0.0));
  float hr = field(v_uv + vec2(eps, 0.0));
  float hu = field(v_uv - vec2(0.0, eps));
  float hd = field(v_uv + vec2(0.0, eps));
  vec2 grad = clamp(vec2(hl - hr, hu - hd) * u_disp, vec2(-0.05), vec2(0.05));
  vec2 outUV = clamp(v_uv + grad, 0.0, 1.0);
  vec2 sourceUV = u_crop.xy + outUV * u_crop.zw;
  vec3 col = texture(u_source, sourceUV).rgb;
  float amp = clamp(abs((hl + hr + hu + hd) * 0.25), 0.0, 0.8);
  col += vec3(0.20, 0.55, 0.70) * amp * 0.6;
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || "(no log)";
    gl.deleteShader(sh);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return sh;
}

function link(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.bindAttribLocation(p, 0, "a_pos");
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error("Program link failed: " + log);
  }
  return p;
}

interface DropRecord {
  x: number;
  y: number;
  t0: number;
  strength: number;
}

export const MerchRippleCanvas = forwardRef<MerchRippleCanvasHandle, Props>(
  function MerchRippleCanvas({ src, className, style }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const dropsRef = useRef<DropRecord[]>([]);
    const startTimeRef = useRef<number>(0);

    useImperativeHandle(
      ref,
      () => ({
        drop(xPct, yPct, strength = 0.45) {
          const now = (performance.now() - startTimeRef.current) / 1000;
          const x = Math.max(0, Math.min(1, xPct / 100));
          // Y is flipped because UVs go bottom-up in the shader (UNPACK_FLIP_Y
          // applied to the source texture means v=0 is the top of the image).
          const y = Math.max(0, Math.min(1, 1 - yPct / 100));
          dropsRef.current.push({ x, y, t0: now, strength });
          // Keep only the most recent MAX_DROPS that haven't expired. Older
          // ones get evicted on insertion to bound the uniform array size.
          if (dropsRef.current.length > MAX_DROPS) {
            dropsRef.current = dropsRef.current.slice(-MAX_DROPS);
          }
        },
      }),
      [],
    );

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const gl = canvas.getContext("webgl2", {
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
      });
      if (!gl) return;

      let prog: WebGLProgram;
      try {
        const vs = compile(gl, gl.VERTEX_SHADER, VERT);
        prog = link(gl, vs, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      } catch (e) {
        console.error(e);
        return;
      }

      const quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );

      const sourceTex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, sourceTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]),
      );

      let imgAR = 1;
      let imgReady = false;
      let cancelled = false;
      const optimizedSrc = src.startsWith("/")
        ? src
        : `/_next/image?url=${encodeURIComponent(src)}&w=1080&q=75`;
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (cancelled) return;
        try {
          gl.bindTexture(gl.TEXTURE_2D, sourceTex);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
          imgAR = img.naturalWidth / img.naturalHeight;
          imgReady = true;
        } catch (e) {
          console.warn("MerchRippleCanvas: texImage2D failed", e);
        }
      };
      img.src = optimizedSrc;

      const uSource = gl.getUniformLocation(prog, "u_source");
      const uCrop = gl.getUniformLocation(prog, "u_crop");
      const uDrops = gl.getUniformLocation(prog, "u_drops");
      const uTime = gl.getUniformLocation(prog, "u_time");
      const uSpeed = gl.getUniformLocation(prog, "u_speed");
      const uFreq = gl.getUniformLocation(prog, "u_freq");
      const uLifetime = gl.getUniformLocation(prog, "u_lifetime");
      const uShellLead = gl.getUniformLocation(prog, "u_shellLead");
      const uShellTrail = gl.getUniformLocation(prog, "u_shellTrail");
      const uDisp = gl.getUniformLocation(prog, "u_disp");

      function setupQuad() {
        gl!.bindBuffer(gl!.ARRAY_BUFFER, quad);
        gl!.enableVertexAttribArray(0);
        gl!.vertexAttribPointer(0, 2, gl!.FLOAT, false, 0, 0);
      }

      const sync = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
        const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
      };
      sync();
      const ro = new ResizeObserver(sync);
      ro.observe(canvas);

      startTimeRef.current = performance.now();
      const dropsBuffer = new Float32Array(MAX_DROPS * 4);

      let raf = 0;
      const tick = () => {
        const now = (performance.now() - startTimeRef.current) / 1000;

        // Cull expired drops so the uniform array doesn't carry dead weight.
        dropsRef.current = dropsRef.current.filter(
          (d) => now - d.t0 <= LIFETIME_S,
        );

        // Pack into a flat Float32Array for uniform4fv. Inactive slots get
        // strength=0 so the shader's early-out skips them.
        for (let i = 0; i < MAX_DROPS; i++) {
          const d = dropsRef.current[i];
          if (d) {
            dropsBuffer[i * 4 + 0] = d.x;
            dropsBuffer[i * 4 + 1] = d.y;
            dropsBuffer[i * 4 + 2] = d.t0;
            dropsBuffer[i * 4 + 3] = d.strength;
          } else {
            dropsBuffer[i * 4 + 0] = 0;
            dropsBuffer[i * 4 + 1] = 0;
            dropsBuffer[i * 4 + 2] = 0;
            dropsBuffer[i * 4 + 3] = 0;
          }
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);

        if (imgReady) {
          gl.useProgram(prog);
          setupQuad();
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, sourceTex);
          gl.uniform1i(uSource, 0);
          // Cover-crop math: the canvas clientWidth/Height defines the face
          // aspect ratio; we sample the source so it object-fit:covers.
          const faceAR = canvas.clientWidth / canvas.clientHeight || 1;
          let sx = 0, sy = 0, sw = 1, sh = 1;
          if (imgAR > faceAR) {
            sw = faceAR / imgAR;
            sx = (1 - sw) * 0.5;
          } else {
            sh = imgAR / faceAR;
            sy = (1 - sh) * 0.5;
          }
          gl.uniform4f(uCrop, sx, sy, sw, sh);
          gl.uniform4fv(uDrops, dropsBuffer);
          gl.uniform1f(uTime, now);
          gl.uniform1f(uSpeed, SPEED);
          gl.uniform1f(uFreq, FREQ);
          gl.uniform1f(uLifetime, LIFETIME_S);
          gl.uniform1f(uShellLead, SHELL_LEAD);
          gl.uniform1f(uShellTrail, SHELL_TRAIL);
          gl.uniform1f(uDisp, DISPLACEMENT);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }

        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      return () => {
        cancelled = true;
        img.onload = null;
        img.onerror = null;
        img.src = "";
        cancelAnimationFrame(raf);
        ro.disconnect();
        gl.deleteTexture(sourceTex);
        gl.deleteBuffer(quad);
        gl.deleteProgram(prog);
      };
    }, [src]);

    return <canvas ref={canvasRef} className={className} style={style} />;
  },
);
