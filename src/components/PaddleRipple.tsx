"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { CSSProperties } from "react";

// Trimmed ripple canvas for the ReleaseHero paddles. Same ring math as
// MerchRippleCanvas but no source texture — output is transparent + cyan
// tint scaled by ring amplitude, so the paddle's CSS gradient stays visible
// underneath and only the ripple itself paints over it.

export interface PaddleRippleHandle {
  drop: (xPct: number, yPct: number, strength?: number) => void;
}

interface Props {
  className?: string;
  style?: CSSProperties;
}

const MAX_DROPS = 24;
const SPEED = 0.45;
const FREQ = 30.0;
const SHELL_LEAD = 0.03;
const SHELL_TRAIL = 0.18;
const LIFETIME_S = 2.6;

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec4 u_drops[${MAX_DROPS}];
uniform float u_time;
uniform float u_speed;
uniform float u_freq;
uniform float u_lifetime;
uniform float u_shellLead;
uniform float u_shellTrail;
out vec4 outColor;

float ring(vec2 p, vec4 drop) {
  if (drop.w <= 0.0) return 0.0;
  float age = u_time - drop.z;
  if (age < 0.0 || age > u_lifetime) return 0.0;
  float r = distance(p, drop.xy);
  float wavefront = age * u_speed;
  float dr = r - wavefront;
  float sig = (dr > 0.0) ? u_shellLead : u_shellTrail;
  float shell = exp(-dr * dr / (sig * sig));
  float wave = sin(dr * u_freq);
  float fade = 1.0 - age / u_lifetime;
  return drop.w * shell * wave * fade * fade;
}

void main() {
  float h = 0.0;
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    h += ring(v_uv, u_drops[i]);
  }
  float amp = clamp(abs(h), 0.0, 1.0);
  // Cyan ripple, alpha scales with amplitude so background shows through.
  outColor = vec4(vec3(0.45, 0.65, 1.0), amp * 0.85);
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

export const PaddleRipple = forwardRef<PaddleRippleHandle, Props>(
  function PaddleRipple({ className, style }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const dropsRef = useRef<DropRecord[]>([]);
    const startTimeRef = useRef<number>(0);

    useImperativeHandle(
      ref,
      () => ({
        drop(xPct, yPct, strength = 0.55) {
          const now = (performance.now() - startTimeRef.current) / 1000;
          const x = Math.max(0, Math.min(1, xPct / 100));
          const y = Math.max(0, Math.min(1, 1 - yPct / 100));
          dropsRef.current.push({ x, y, t0: now, strength });
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

      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      const quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
        gl.STATIC_DRAW,
      );

      const uDrops = gl.getUniformLocation(prog, "u_drops");
      const uTime = gl.getUniformLocation(prog, "u_time");
      const uSpeed = gl.getUniformLocation(prog, "u_speed");
      const uFreq = gl.getUniformLocation(prog, "u_freq");
      const uLifetime = gl.getUniformLocation(prog, "u_lifetime");
      const uShellLead = gl.getUniformLocation(prog, "u_shellLead");
      const uShellTrail = gl.getUniformLocation(prog, "u_shellTrail");

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
        dropsRef.current = dropsRef.current.filter((d) => now - d.t0 <= LIFETIME_S);

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

        gl.useProgram(prog);
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.uniform4fv(uDrops, dropsBuffer);
        gl.uniform1f(uTime, now);
        gl.uniform1f(uSpeed, SPEED);
        gl.uniform1f(uFreq, FREQ);
        gl.uniform1f(uLifetime, LIFETIME_S);
        gl.uniform1f(uShellLead, SHELL_LEAD);
        gl.uniform1f(uShellTrail, SHELL_TRAIL);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        raf = requestAnimationFrame(tick);
      };
      tick();

      return () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
      };
    }, []);

    return <canvas ref={canvasRef} className={className} style={style} />;
  },
);
