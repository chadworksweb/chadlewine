"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { CSSProperties } from "react";

// Per-face GPU water ripple. A WebGL2 fragment-shader pipeline runs a 2D
// wave-equation simulation on a low-resolution heightfield, then samples the
// source image with displacement driven by the heightfield gradient. Cursor
// motion translates into "drops" injected into the heightfield, which radiate
// outward as proper waves and refract the underlying image.

export interface DiscoFaceWaterHandle {
  drop: (xPct: number, yPct: number, strength?: number) => void;
}

interface Props {
  src: string;
  focalX?: number | null; // 0..100
  focalY?: number | null;
  zoom?: number | null;
  className?: string;
  style?: CSSProperties;
}

// Simulation grid. Lower = softer, lighter cost; higher = crisper waves.
const SIM_RES = 256;
// Energy decay per step. 0.992 ≈ ~1.2s sustain — fast enough that drop
// energy can't pile up to blow-out levels even when the cursor lingers.
const DAMPING = 0.992;
// How much the heightfield gradient warps source UVs in the render pass.
const DISPLACEMENT = 0.045;
// Drop radius in normalized [0,1] simulation units.
const DROP_RADIUS = 0.04;

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Wave step: each fragment writes (next_height, curr_height) into RG.
// Standard discretized 2D wave equation; the previous step's R becomes G.
const FRAG_STEP = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
uniform sampler2D u_state;
uniform vec2 u_texel;
uniform float u_damping;
out vec4 outColor;
void main() {
  vec4 c = texture(u_state, v_uv);
  float curr = c.r;
  float prev = c.g;
  float l = texture(u_state, v_uv - vec2(u_texel.x, 0.0)).r;
  float r = texture(u_state, v_uv + vec2(u_texel.x, 0.0)).r;
  float u = texture(u_state, v_uv - vec2(0.0, u_texel.y)).r;
  float d = texture(u_state, v_uv + vec2(0.0, u_texel.y)).r;
  float next = ((l + r + u + d) * 0.5 - prev) * u_damping;
  // Hard ceiling on amplitude prevents numerical runaway. RG16F has limited
  // range; without this, persistent cursor-looping pushes values into
  // precision territory where the wave equation aliases violently.
  next = clamp(next, -2.0, 2.0);
  outColor = vec4(next, curr, 0.0, 1.0);
}`;

// Drop pass: additive gaussian-ish bump on the R channel at u_dropPos.
const FRAG_DROP = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
uniform sampler2D u_state;
uniform vec2 u_dropPos;
uniform float u_dropRadius;
uniform float u_dropStrength;
out vec4 outColor;
void main() {
  vec4 c = texture(u_state, v_uv);
  float d = distance(v_uv, u_dropPos);
  float energy = u_dropStrength * smoothstep(u_dropRadius, 0.0, d);
  outColor = vec4(c.r + energy, c.g, 0.0, 1.0);
}`;

// Render pass: warp source UVs by heightfield gradient + add a subtle cyan
// highlight where wave amplitude is high.
const FRAG_RENDER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 v_uv;
uniform sampler2D u_state;
uniform sampler2D u_source;
uniform vec4 u_crop;       // sx, sy, sw, sh in [0,1] of source texture
uniform vec2 u_texel;
uniform float u_disp;
out vec4 outColor;
void main() {
  float l = texture(u_state, v_uv - vec2(u_texel.x, 0.0)).r;
  float r = texture(u_state, v_uv + vec2(u_texel.x, 0.0)).r;
  float u = texture(u_state, v_uv - vec2(0.0, u_texel.y)).r;
  float d = texture(u_state, v_uv + vec2(0.0, u_texel.y)).r;
  // Clamp the per-fragment displacement so a runaway heightfield (energy
  // piling up at one cursor-loop spot) can't push UVs into edge-pixel
  // streaking — the "skeleton/solar" artifact.
  vec2 grad = clamp(vec2(l - r, u - d) * u_disp, vec2(-0.05), vec2(0.05));
  vec2 outUV = clamp(v_uv + grad, 0.0, 1.0);
  vec2 sourceUV = u_crop.xy + outUV * u_crop.zw;
  vec3 col = texture(u_source, sourceUV).rgb;
  // Specular crest highlight — wave peaks reflect a touch of cyan. Clamp
  // amp so a runaway heightfield can't drive the additive past the displayable
  // range (which produces flickering color-banding / "solarization").
  float amp = clamp(abs((l + r + u + d) * 0.25), 0.0, 0.8);
  col += vec3(0.20, 0.55, 0.70) * amp * 0.6;
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || "(no log)";
    const stage = type === gl.VERTEX_SHADER ? "vertex" : "fragment";
    gl.deleteShader(sh);
    throw new Error(
      `Shader (${stage}) compile failed: ${log}\n----- source -----\n${src}\n------------------`,
    );
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

function makeFloatTex(gl: WebGL2RenderingContext, w: number, h: number): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  // Upload zero-filled buffer instead of null. On some drivers, allocating
  // a float texture with null and clearing via clearColor is a no-op — the
  // texture keeps GPU memory garbage. Half-float zero is bit pattern 0x0000,
  // so a zero-initialized Uint16Array genuinely zeroes the RG channels.
  const zeros = new Uint16Array(w * h * 2);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, w, h, 0, gl.RG, gl.HALF_FLOAT, zeros);
  // NEAREST filter (not LINEAR) on float textures: LINEAR sampling of half-
  // float textures requires OES_texture_float_linear, which isn't universally
  // available even when EXT_color_buffer_float is. Without it, LINEAR reads
  // are implementation-defined and on many drivers return garbage — the
  // exact "every pixel glitches" symptom. Wave sim only samples at integer
  // texel offsets, so NEAREST is the right fit anyway.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

// Cover-crop math: given an image AR and a face AR plus focal point + zoom,
// return the (sx, sy, sw, sh) sub-rect of the source texture (in normalized
// [0,1]) to sample so the result mimics CSS object-fit:cover with object-position.
function computeCropUV(
  imgAR: number,
  faceAR: number,
  fx: number,
  fy: number,
  zoom: number,
): [number, number, number, number] {
  let sw = 1, sh = 1, sx = 0, sy = 0;
  const z = Math.max(1, zoom);
  if (imgAR > faceAR) {
    sw = (faceAR / imgAR) / z;
    sh = 1 / z;
  } else {
    sw = 1 / z;
    sh = (imgAR / faceAR) / z;
  }
  sx = (1 - sw) * fx;
  sy = (1 - sh) * fy;
  return [sx, sy, sw, sh];
}

export const DiscoFaceWater = forwardRef<DiscoFaceWaterHandle, Props>(
  function DiscoFaceWater({ src, focalX, focalY, zoom, className, style }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const queuedDropsRef = useRef<{ x: number; y: number; strength: number }[]>([]);
    // Latest crop values, read by the render loop without re-init.
    const cropParamsRef = useRef({
      fx: ((focalX ?? 50) / 100),
      fy: ((focalY ?? 50) / 100),
      z: zoom ?? 1,
    });
    cropParamsRef.current = {
      fx: (focalX ?? 50) / 100,
      fy: (focalY ?? 50) / 100,
      z: zoom ?? 1,
    };

    useImperativeHandle(
      ref,
      () => ({
        drop(xPct, yPct, strength = 0.45) {
          // Convert face-local % into normalized [0,1] sim coords. Y is flipped
          // because the source texture is uploaded with UNPACK_FLIP_Y so v=0
          // is the top of the image — the heightfield uses GL convention.
          queuedDropsRef.current.push({
            x: Math.max(0, Math.min(1, xPct / 100)),
            y: Math.max(0, Math.min(1, 1 - yPct / 100)),
            strength,
          });
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

      // Float color attachments need this on most drivers.
      gl.getExtension("EXT_color_buffer_float");
      gl.getExtension("OES_texture_float_linear");

      // Compile programs.
      let stepProg: WebGLProgram, dropProg: WebGLProgram, renderProg: WebGLProgram;
      try {
        const vs = compile(gl, gl.VERTEX_SHADER, VERT);
        stepProg = link(gl, vs, compile(gl, gl.FRAGMENT_SHADER, FRAG_STEP));
        dropProg = link(gl, vs, compile(gl, gl.FRAGMENT_SHADER, FRAG_DROP));
        renderProg = link(gl, vs, compile(gl, gl.FRAGMENT_SHADER, FRAG_RENDER));
      } catch (e) {
        console.error(e);
        return;
      }

      // Fullscreen-quad VBO.
      const quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );

      // Ping-pong sim textures + framebuffers.
      let texA = makeFloatTex(gl, SIM_RES, SIM_RES);
      let texB = makeFloatTex(gl, SIM_RES, SIM_RES);
      const fboA = gl.createFramebuffer();
      const fboB = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboA);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texA, 0);
      const statusA = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (statusA !== gl.FRAMEBUFFER_COMPLETE) {
        console.warn("DiscoFaceWater: fboA incomplete", statusA.toString(16));
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboB);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texB, 0);
      const statusB = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (statusB !== gl.FRAMEBUFFER_COMPLETE) {
        console.warn("DiscoFaceWater: fboB incomplete", statusB.toString(16));
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      // Source image texture.
      const sourceTex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, sourceTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      // Placeholder 1x1 black pixel until the image loads — keeps the canvas
      // from flashing undefined-texture artifacts on slow networks.
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]),
      );

      let imgAR = 1;
      let imgReady = false;
      // Cancellation flag for the async image load. React StrictMode double-
      // invokes effects: mount-1 starts the image load, cleanup-1 deletes the
      // textures, mount-2 starts fresh. If mount-1's image finishes loading
      // AFTER cleanup, its onload would call texImage2D against a deleted
      // texture handle. WebGL handle reuse means that deleted handle may now
      // point to mount-2's heightfield texture — the image bytes overwrite
      // it with the wrong format, the wave sim reads garbage, the face
      // renders glitched. Setting cancelled=true in cleanup stops this.
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
          console.warn("DiscoFaceWater: texImage2D failed", e);
        }
      };
      img.onerror = () => {
        if (cancelled) return;
        console.warn("DiscoFaceWater: image failed to load", optimizedSrc);
      };
      img.src = optimizedSrc;

      // Cache uniform locations.
      const uStepState = gl.getUniformLocation(stepProg, "u_state");
      const uStepTexel = gl.getUniformLocation(stepProg, "u_texel");
      const uStepDamp = gl.getUniformLocation(stepProg, "u_damping");
      const uDropState = gl.getUniformLocation(dropProg, "u_state");
      const uDropPos = gl.getUniformLocation(dropProg, "u_dropPos");
      const uDropRadius = gl.getUniformLocation(dropProg, "u_dropRadius");
      const uDropStrength = gl.getUniformLocation(dropProg, "u_dropStrength");
      const uRenderState = gl.getUniformLocation(renderProg, "u_state");
      const uRenderSource = gl.getUniformLocation(renderProg, "u_source");
      const uRenderCrop = gl.getUniformLocation(renderProg, "u_crop");
      const uRenderTexel = gl.getUniformLocation(renderProg, "u_texel");
      const uRenderDisp = gl.getUniformLocation(renderProg, "u_disp");

      function setupQuadAttrib() {
        gl!.bindBuffer(gl!.ARRAY_BUFFER, quad);
        gl!.enableVertexAttribArray(0);
        gl!.vertexAttribPointer(0, 2, gl!.FLOAT, false, 0, 0);
      }

      // Match canvas drawing buffer to its CSS pixel size at devicePixelRatio.
      let cssW = canvas.clientWidth || 1;
      let cssH = canvas.clientHeight || 1;
      const sync = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
        const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        cssW = canvas.clientWidth || 1;
        cssH = canvas.clientHeight || 1;
      };
      sync();
      const ro = new ResizeObserver(sync);
      ro.observe(canvas);

      let raf = 0;
      // Two ping-pong textures: read from `read`, write to `write`. Swap each step.
      let read = { tex: texA, fbo: fboA };
      let write = { tex: texB, fbo: fboB };

      const tick = () => {
        // 1. Apply queued drops (one pass per drop).
        const drops = queuedDropsRef.current;
        if (drops.length > 0) {
          gl.useProgram(dropProg);
          setupQuadAttrib();
          gl.viewport(0, 0, SIM_RES, SIM_RES);
          gl.uniform1i(uDropState, 0);
          gl.uniform1f(uDropRadius, DROP_RADIUS);
          for (const d of drops) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, read.tex);
            gl.uniform2f(uDropPos, d.x, d.y);
            gl.uniform1f(uDropStrength, d.strength);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            const swap = read; read = write; write = swap;
          }
          drops.length = 0;
        }

        // 2. One simulation step.
        gl.useProgram(stepProg);
        setupQuadAttrib();
        gl.viewport(0, 0, SIM_RES, SIM_RES);
        gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, read.tex);
        gl.uniform1i(uStepState, 0);
        gl.uniform2f(uStepTexel, 1 / SIM_RES, 1 / SIM_RES);
        gl.uniform1f(uStepDamp, DAMPING);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        { const swap = read; read = write; write = swap; }

        // 3. Render to canvas. Always clear first — keeps the canvas
        // transparent (showing the static <Image> underneath) until the
        // source texture is ready, instead of holding driver-undefined garbage.
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (imgReady) {
          gl.useProgram(renderProg);
          setupQuadAttrib();
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, read.tex);
          gl.uniform1i(uRenderState, 0);
          gl.activeTexture(gl.TEXTURE1);
          gl.bindTexture(gl.TEXTURE_2D, sourceTex);
          gl.uniform1i(uRenderSource, 1);
          const faceAR = cssW / cssH || 1;
          const { fx, fy, z } = cropParamsRef.current;
          const [sx, sy, sw, sh] = computeCropUV(imgAR, faceAR, fx, fy, z);
          gl.uniform4f(uRenderCrop, sx, sy, sw, sh);
          gl.uniform2f(uRenderTexel, 1 / SIM_RES, 1 / SIM_RES);
          gl.uniform1f(uRenderDisp, DISPLACEMENT);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }

        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      return () => {
        // Cancel any pending async work first — see the cancelled flag's
        // explanation above. img.src = "" also tells the browser to abort
        // the in-flight fetch if possible, freeing the request slot.
        cancelled = true;
        img.onload = null;
        img.onerror = null;
        img.src = "";
        cancelAnimationFrame(raf);
        ro.disconnect();
        // Delete GL resources but DO NOT call loseContext: React StrictMode
        // double-invokes effects on the same canvas, and a lost context
        // sticks — the next mount's getContext() returns the dead context,
        // shader compilation fails silently with (no log).
        gl.deleteTexture(texA);
        gl.deleteTexture(texB);
        gl.deleteTexture(sourceTex);
        gl.deleteFramebuffer(fboA);
        gl.deleteFramebuffer(fboB);
        gl.deleteBuffer(quad);
        gl.deleteProgram(stepProg);
        gl.deleteProgram(dropProg);
        gl.deleteProgram(renderProg);
      };
    }, [src]);

    return <canvas ref={canvasRef} className={className} style={style} />;
  },
);
