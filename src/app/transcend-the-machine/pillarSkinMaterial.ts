/* Glitch art panel that rides inside a pillar's wireframe (Section 5: "Chad's
 * graphics ride the wireframe, they do not replace it"). Lifted from
 * PillarColonnade's fragment shader - the 4 glitch archetypes, LCD dot-matrix
 * cells, RGB subpixel mask, chromatic split, scanline - reworked to skin a 3D
 * box face and output an emissive color the UnrealBloom pass can catch.
 *
 * The displacement amount (uGlitch) and brightness (uBeat) are beat-driven so
 * pillars corrupt + throb on the kick - the machine glitching around you.
 * Fog is applied manually (a raw ShaderMaterial gets no scene fog) using the
 * same exp2 falloff as the scene's FogExp2, so distant panels melt to black.
 *
 * SCOPE: this LCD dot-matrix / glitch pass is for the PIXEL-PILLAR / cover art
 * only. The fractals (E:\Chad Lewine Art\fractals) are glowing radial line-work
 * - the organic twin of the vector look - and must ride RAW, un-pixelated, as
 * skybox / rune glow / portal. Do NOT run fractal art through this material;
 * a later phase adds a separate non-pixelated fractal material. */

import * as THREE from "three";

const VERT = /* glsl */ `
varying vec2 vUv;
varying float vFog;
uniform float uFogDensity;
uniform float uTime;
uniform float uWarp;   // 0..1 spatial-warp amount (subtle vertex ripple)
void main(){
  vUv = uv;
  vec3 pos = position;
  // Subtle ripple: bend the pillar along its height as the warp synth moves.
  // Small amplitudes on purpose - an aberration, not a wobble.
  if (uWarp > 0.0001) {
    pos.x += sin(position.y * 0.9 + uTime * 2.2) * uWarp * 0.18;
    pos.z += cos(position.y * 0.7 + uTime * 1.7) * uWarp * 0.12;
  }
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  float dist = length(mv.xyz);
  vFog = clamp(1.0 - exp(-uFogDensity * uFogDensity * dist * dist), 0.0, 1.0);
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
varying float vFog;
uniform sampler2D uTex;
uniform float uHasTex;
uniform float uTime;
uniform float uSeed;
uniform float uGlitchId;
uniform float uGlitch;   // 0..1 corruption amount (beat-driven)
uniform float uBeat;     // 0..1 brightness pulse (kick)
uniform float uGlow;     // 0..1 harmonic glow (chord synth) - subtle warm lift
uniform vec3  uTint;     // per-level hue
#define TAU 6.28318530718

float rand(float n){ return fract(sin(n * 12.9898 + uSeed * 7.13) * 43758.5453); }

// Glitch displacement archetypes (PillarColonnade styles 0-3). Returns a uv
// delta to add to the art sampling coords; amt scales by the beat envelope.
vec2 glitchShift(float style, float amt, float yy, float xx, float sd, float t){
  vec2 d = vec2(0.0);
  if (amt <= 0.0) return d;
  if (style < 0.5) {
    float band = floor((1.0 - yy) * (20.0 + mod(sd, 9.0)));
    float r = fract(sin(band * 45.3 + sd * 7.7) * 43758.5453);
    d.x = (r - 0.5) * 0.16 * amt * step(0.55, r);
  } else if (style < 1.5) {
    float band = floor(((1.0 - yy) * 1.4 + xx) * (15.0 + mod(sd, 6.0)));
    float r = fract(sin(band * 27.3 + sd * 5.1) * 23197.0);
    float s = (r - 0.5) * 0.18 * amt * step(0.45, r);
    d.x = s; d.y = s * 0.7;
  } else if (style < 2.5) {
    vec2 bc = floor(vec2(xx, 1.0 - yy) * (7.0 + mod(sd, 5.0)));
    float r = fract(sin(dot(bc, vec2(41.3, 13.7)) + sd * 3.3) * 9173.0);
    float r2 = fract(sin(dot(bc, vec2(11.1, 47.7)) + sd * 1.7) * 6131.0);
    float on = step(0.62, r);
    d.x = (r - 0.5) * 0.22 * amt * on;
    d.y = (r2 - 0.5) * 0.16 * amt * on;
  } else {
    d.x = sin((1.0 - yy) * (16.0 + mod(sd, 7.0)) + t * 8.0 + sd) * 0.06 * amt;
    d.y = sin((1.0 - yy) * 7.0 + sd) * 0.02 * amt;
  }
  return d;
}

void main(){
  vec2 uv = vUv;

  // Beat-driven glitch displacement of the art coords.
  float baseStyle = mod(uGlitchId - 1.0, 4.0);
  vec2 gd = glitchShift(baseStyle, uGlitch, uv.y, uv.x, uSeed, uTime);
  vec2 auv = fract(uv + gd);

  // LCD pixelation - art (or tint) broken into chunky cells.
  vec2 cells = vec2(14.0, 30.0);
  vec2 puv = (floor(auv * cells) + 0.5) / cells;

  vec3 col;
  if (uHasTex > 0.5) {
    col = texture2D(uTex, puv).rgb;
    // Chromatic RGB split during the glitch - electric color fringing.
    if (uGlitch > 0.001) {
      float o = 0.02 * uGlitch;
      col.r = texture2D(uTex, (floor(vec2(auv.x + o, auv.y) * cells) + 0.5) / cells).r;
      col.b = texture2D(uTex, (floor(vec2(auv.x - o, auv.y) * cells) + 0.5) / cells).b;
    }
  } else {
    // No art for this level yet: a procedural tinted panel still reads as the
    // LCD dot-matrix skin so the look holds before assets are assigned.
    col = uTint * (0.18 + 0.6 * rand(floor(auv.y * cells.y) + floor(auv.x * cells.x) * 3.0));
  }

  // Posterize for the retro panel banding.
  col = floor(col * 7.0) / 7.0;

  // RGB subpixel mask: split each cell into R / G / B thirds.
  vec2 pg = auv * cells;
  float cx = fract(pg.x);
  vec3 sp = vec3(
    step(cx, 1.0 / 3.0),
    step(1.0 / 3.0, cx) * step(cx, 2.0 / 3.0),
    step(2.0 / 3.0, cx)
  );
  col *= (vec3(0.5) + sp * 0.6);

  // Dot-matrix grid gaps between cells.
  vec2 g = abs(fract(pg) - 0.5) * 2.0;
  float gap = (1.0 - smoothstep(0.82, 0.99, g.x)) * (1.0 - smoothstep(0.84, 0.99, g.y));
  col *= mix(0.5, 1.0, gap);

  // Drifting scanline.
  col *= 0.9 + 0.1 * sin((auv.y * cells.y + uTime * 0.6) * TAU);

  // Pull the panel toward the level hue. Kept in a sane emissive range so the
  // bloom pass reads it as a lit phosphor panel, not a blown-out slab.
  col = mix(col, col * uTint * 1.3, 0.4);
  col *= 0.85;

  // Kick brightness pulse + a hot tint flash on glitch.
  col *= 1.0 + uBeat * 0.45;
  col += uGlitch * vec3(0.14, 0.03, 0.22);

  // Harmonic glow: a subtle warm emissive lift as the chord synth sustains.
  // Kept low so it reads as the room gently warming, not a flash.
  col *= 1.0 + uGlow * 0.22;
  col += uGlow * vec3(0.05, 0.035, 0.015);

  // Fog the panel into the void (manual - no auto fog on raw ShaderMaterial).
  col *= (1.0 - vFog);

  gl_FragColor = vec4(col, 1.0);
}`;

export type PillarSkinUniforms = {
  uTex: { value: THREE.Texture | null };
  uHasTex: { value: number };
  uTime: { value: number };
  uSeed: { value: number };
  uGlitchId: { value: number };
  uGlitch: { value: number };
  uBeat: { value: number };
  uGlow: { value: number };
  uWarp: { value: number };
  uTint: { value: THREE.Color };
  uFogDensity: { value: number };
};

export function makePillarSkinMaterial(opts: {
  seed: number;
  glitchId: number;
  tint: THREE.Color;
  texture: THREE.Texture | null;
  hasTexture: boolean;
  fogDensity: number;
}): THREE.ShaderMaterial {
  const uniforms: PillarSkinUniforms = {
    uTex: { value: opts.texture },
    uHasTex: { value: opts.hasTexture ? 1 : 0 },
    uTime: { value: 0 },
    uSeed: { value: opts.seed },
    uGlitchId: { value: opts.glitchId },
    uGlitch: { value: 0 },
    uBeat: { value: 0 },
    uGlow: { value: 0 },
    uWarp: { value: 0 },
    uTint: { value: opts.tint },
    uFogDensity: { value: opts.fogDensity },
  };
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    side: THREE.FrontSide,
    transparent: false,
  });
}
