"use client";

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/** Beat morph request shape — CubeVisualizer's tick mutates `.pending` to
 *  true when a transient beat fires, the mesh consumes it on its next
 *  frame and resets the flag. `seed` is randomized per beat so variant
 *  behavior (noise pattern, sphere-blend) differs each time. `intensity`
 *  scales the morph amplitude so the biggest beats deform the mesh more. */
export type BeatMorphRequest = {
  pending: boolean;
  seed: number;
  intensity: number;
};

/** Snare pulse mailbox — same one-shot pattern as BeatMorphRequest but
 *  drives the corner-spike effect instead of the radial face bulge. Kept
 *  separate so a kick morph and a snare spike can decay independently
 *  when both fire on the same beat (kick+backbeat overlap). */
export type SnarePulseRequest = {
  pending: boolean;
  intensity: number;
};

/** Generic one-shot pulse mailbox for the secondary stem effects: hat,
 *  tom, bass pulse. `seed` is used by tom to pick a shake direction;
 *  other effects ignore it. Same producer/consumer contract as the
 *  kick/snare refs above. */
export type PulseRequest = {
  pending: boolean;
  intensity: number;
  seed: number;
};

/** One dash on the hat trail. face is 0..5 (+X, -X, +Y, -Y, +Z, -Z),
 *  (u, v) are 0..1 face-local UV coords, age in number of hat hits
 *  since this dash was placed, (dirU, dirV) is the pen's heading at
 *  placement time (used to orient the dash as a line segment along
 *  pen motion). */
export type HatTrailEntry = {
  face: number;
  u: number;
  v: number;
  dirU: number;
  dirV: number;
  age: number;
};

// Fixed trail capacity matched to the GLSL fragment loop bound.
const HAT_TRAIL_CAP = 30;

/** Per-frame animation state shared with the mesh via ref. CubeVisualizer
 *  owns the rotation accumulator and bass smoothing; the mesh reads them
 *  inside useFrame to drive its transform/shader uniforms. */
export type MeshAnimRef = {
  rx: number;        // accumulated X rotation (degrees, unwrapped)
  ry: number;        // accumulated Y rotation (degrees, unwrapped)
  bass: number;      // smoothed bass amplitude 0..1
};

// ─── Shaders ────────────────────────────────────────────────────────────
// Vertex shader displaces every vertex along its normal using 3D simplex
// noise, scaled by uMorphAmount. uVariantSeed shifts both the noise
// pattern frequency and a sphere-blend factor so each beat produces a
// distinct CGI-feeling melt/spike/blob shape. Without subdivisions on the
// box geometry the displacement would only happen at corners; we use a
// fairly dense subdivided BoxGeometry on the consumer side.
const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPos;

uniform float uTime;
uniform float uMorphAmount;
uniform float uVariantSeed;
uniform float uBass;

varying float vCornerMask;   // 1 at the 8 cube corners, 0 along edges + face interiors
flat varying float vFace;    // 0=+X 1=-X 2=+Y 3=-Y 4=+Z 5=-Z (constant per face, derived from vertex normal)

//
// Simplex noise 3D (Ashima Arts) — compact, fast, license-permissive.
//
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

void main() {
  // Inset UVs by ~0.5% on each side so the texture sampler never reaches
  // the exact texel boundary at face corners. The BoxGeometry maps each
  // face's UV from (0,0) to (1,1); the very corner vertices sit on the
  // texture edge and, with anisotropic filtering, sample pixels just
  // beyond it — which clamp-to-edge mode reads as the dark border of the
  // cover art, drawing thin dark "inner cube" outlines at each corner.
  vUv = uv * 0.992 + 0.004;
  vNormal = normalize(normalMatrix * normal);

  // Face ID from raw object-space normal (BoxGeometry has flat per-face
  // normals — all 4 vertices of any face share the same direction).
  // Encoded 0..5 in the same order the JS pen uses (+X -X +Y -Y +Z -Z).
  vec3 ln = normal;
  if (ln.x > 0.5)       vFace = 0.0;
  else if (ln.x < -0.5) vFace = 1.0;
  else if (ln.y > 0.5)  vFace = 2.0;
  else if (ln.y < -0.5) vFace = 3.0;
  else if (ln.z > 0.5)  vFace = 4.0;
  else                  vFace = 5.0;

  // Per-variant pattern. Frequency dropped HARD (0.25-0.6) so each face
  // shows roughly one continuous wave / bulge, not multiple ripples.
  // At freq 0.4 over a 1.32-unit cube, the noise period across a face is
  // wider than the face itself — only a partial wave per face = single
  // smooth convex bulge.
  float freq      = mix(0.25, 0.6, fract(uVariantSeed * 0.731));
  float timeOff   = uVariantSeed * 117.0;
  // Kick morph amplitude. Was 0.18 -> 0.22; reduced ~1/3 to 0.147 to dial
  // back the face extrusion (per request). Snares get a fragment-shader
  // corner strobe instead of a geometry change — see the fragment shader.
  float amp       = 0.147;

  // Radial direction (from cube center). Pushing along this keeps faces
  // sealed because every vertex sharing a world position pushes the same
  // direction, regardless of which face they belong to in the geometry.
  vec3 radial = length(position) > 0.0001 ? normalize(position) : vec3(0.0, 1.0, 0.0);

  // EDGE MASK — keeps the cube's silhouette firm. For a cube centered at
  // origin with half-extent ~0.66, each vertex has three "distance to
  // face boundary" values (halfExtent - |coord|). On a FACE INTERIOR
  // two of these are positive and one is ~0. On an EDGE two are ~0 and
  // one is positive. On a CORNER all three are ~0. The MIDDLE of the
  // three sorted distances tells us how far we are from the nearest
  // edge: ~0 at edges/corners, large at face interior. smoothstep'd
  // into a 0..1 mask that zeroes out displacement near edges so the
  // cube outline stays solid while face interiors bulge.
  float halfExt = 0.66;
  vec3 d = halfExt - abs(position);
  float dmin = min(d.x, min(d.y, d.z));
  float dmax = max(d.x, max(d.y, d.z));
  float dmid = d.x + d.y + d.z - dmin - dmax;
  // Mask transitions from 0 at edges to 1 by ~30% of face half-width.
  float edgeMask = smoothstep(0.0, halfExt * 0.32, dmid);

  // Bass pump — uniform scale of the whole cube. Tied to the same uBass
  // that drives the ambient background so they breathe together. Uniform
  // scale preserves the cube's sealed silhouette (every vertex scales by
  // the same factor, including edges).
  float bassPump = uBass * 0.05;

  // Noise pattern frozen per beat (no uTime term) so during the brief
  // decay the bulge shape doesn't animate or ripple — it just snaps in
  // and snaps out. uVariantSeed gives each beat a different static
  // pattern via timeOff.
  float n = snoise(position * freq + vec3(timeOff));

  // CORNER MASK — peaks at the 8 cube corners, asymptotically falls
  // toward zero across face interiors. dmax is the LARGEST distance-
  // to-face: corners have dmax ~= 0, everywhere else dmax is large.
  //
  // Uses exponential decay (NOT smoothstep) for a critical reason:
  // smoothstep has a sharp transition where it reaches exactly zero
  // (its tail meets the clamped-zero region). That C2 discontinuity
  // drew a visible "inner cube" outline at the strobe-zone boundary
  // — a square of dark lines inset 32% from each face edge, exactly
  // where smoothstep's range ended. Exponential decay is C∞ smooth
  // everywhere, asymptotic to zero, never crosses it — no boundary
  // line possible.
  vCornerMask = exp(-dmax * 9.0);

  // Final displacement: bass-pumped scale + face bulge (edges only).
  // No corner displacement — the snare effect is fragment-side.
  vec3 scaled = position * (1.0 + bassPump);
  vec3 displaced = scaled + radial * (n * amp * uMorphAmount * edgeMask);

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  vViewPos = mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

// Fragment shader: sample the cover art texture and add a subtle rim
// highlight so the silhouette reads as a 3D mesh. On snare hits, a bright
// additive strobe lights up the 8 cube corners (vCornerMask) like the
// wingtip lights on an airplane wing.
const FRAGMENT_SHADER = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPos;
varying float vCornerMask;
flat varying float vFace;

uniform sampler2D uTexture;
uniform float uMorphAmount;
uniform float uSnareAmount;     // 0..1, corner strobe (snare hits)
uniform float uHatAmount;       // 0..1, legacy hat rim glow (now disabled; hats draw trails instead)
uniform float uBassPulseAmount; // 0..1, acid color-filter (bass pulse hits)
// Hat trail: ring buffer of up to 30 dashes. uHatTrail[i] = (face, u, v, age).
// age = -1 means slot is unused. Newest entries have age 0; entries with
// age >= 20 are in the fade-out tail; age >= 30 are discarded JS-side
// so they should never appear here.
// uHatTrailDir[i] = (dirU, dirV), the pen's heading at the moment this
// dash was placed. The fragment shader uses it to orient the dash as a
// thin line segment along that direction (a tick mark, not a disc).
uniform vec4 uHatTrail[30];
uniform vec2 uHatTrailDir[30];

void main() {
  vec4 tex = texture2D(uTexture, vUv);

  // Show the cover art as-is. (Previously, near-black pixels were replaced
  // with a vUv color gradient as a load-time diagnostic — but that fired
  // PER PIXEL on any dark region of a real cover, painting a rainbow wash
  // over the dark parts of the art. Covers with dark backgrounds read as
  // "filtered"; bright covers barely showed it, which is why it looked like
  // it only hit some songs. Dark cover pixels now render dark, as intended.)
  vec3 base = tex.rgb;

  // Cheap rim term — view direction is roughly -z in view space.
  vec3 viewDir = normalize(-vViewPos);
  float ndv = max(0.0, dot(normalize(vNormal), viewDir));
  float rim = pow(1.0 - ndv, 2.4);

  // Hat rim glow is disabled — hats now draw a dash trail on the cube
  // surface (see HAT TRAIL block below). The uniform is kept defined so
  // legacy songs / future re-enabling is one line away.
  vec3 color = base + rim * (0.12 + uMorphAmount * 0.25);

  // HAT TRAIL — walking dash effect. Each entry in uHatTrail is one
  // tick-mark on the cube's surface, oriented along the pen's heading
  // at the time it was placed. Rendered as a hard-edged thin line
  // segment (no smoothstep / feather): solid white inside the rect,
  // zero outside. Dimensions tuned so a single dash reads as a ~3px
  // tick on a typical cube face (~400px wide rendered).
  float trailGlow = 0.0;
  // Length along pen direction (~14px on a 400px face).
  const float DASH_HALF_LEN = 0.018;
  // Width perpendicular to pen direction (~3px on a 400px face).
  const float DASH_HALF_W   = 0.0035;
  for (int i = 0; i < 30; i++) {
    vec4 d = uHatTrail[i];
    if (d.w < 0.0) continue;
    if (abs(d.x - vFace) > 0.1) continue;  // dash not on this face
    vec2 dashUv = vec2(d.y, d.z);
    vec2 dir = uHatTrailDir[i];
    // Defensive normalize in case the uniform got loaded with a
    // zero-length direction (sentinel slot, etc.) — avoids NaN.
    float dlen = length(dir);
    if (dlen < 0.001) continue;
    dir = dir / dlen;
    vec2 perp = vec2(-dir.y, dir.x);
    vec2 toFrag = vUv - dashUv;
    float along = abs(dot(toFrag, dir));
    float across = abs(dot(toFrag, perp));
    // Hard rectangle: inside = full, outside = nothing. No feather.
    if (along < DASH_HALF_LEN && across < DASH_HALF_W) {
      // Age fade still applies — first 20 dashes full, last 10 linear
      // fade to zero. Older dashes pass through quantization steps in
      // intensity but each remains solid (no edge feather).
      float ageFade = d.w < 20.0 ? 1.0 : max(0.0, 1.0 - (d.w - 20.0) / 10.0);
      trailGlow = max(trailGlow, ageFade);
    }
  }
  // White-cool tint matches the snare strobe so both percussive accents
  // read as the same "stage lighting" family.
  color += vec3(1.0, 1.04, 1.10) * trailGlow * 0.95;

  // BASS PULSE — acid color filter (restored). NOT a spatial effect (the
  // cube doesn't swell). Boosts saturation hard and skews the palette toward
  // magenta + cyan on the R/B axis, pulling G down. Result: the cover art
  // briefly reads like it got dunked in acid — same composition, intensified,
  // hue-warped. Decays out cleanly so the cube returns to normal.
  //
  // SCOPED TO STEM CUBES BY CONSTRUCTION: uBassPulseAmount is fed from
  // bassPulseState, which is only ever set by beat_data bp hits. Default
  // (frequency) cubes have no beat_data, so uBassPulseAmount stays 0 and this
  // block never fires for them. The previous "leaks onto every cube" was a
  // bug, not the intent -- if it reappears, the leak is upstream in the feed,
  // not here.
  if (uBassPulseAmount > 0.001) {
    float luma = dot(color, vec3(0.299, 0.587, 0.114));
    vec3 saturated = mix(vec3(luma), color, 1.0 + uBassPulseAmount * 1.8);
    // Magenta/cyan acid lean: R + B up, G down.
    vec3 acidWash = saturated * vec3(1.18, 0.78, 1.32);
    color = mix(color, acidWash, min(1.0, uBassPulseAmount));
  }

  // SNARE STROBE — airplane wingtip flash. Tightens the corner mask
  // before lighting so the strobe reads as a small point of light at
  // each corner rather than a soft halo bleeding across half the face.
  // pow(mask, 2.5) sharpens; multiplier (1.4) overdrives the peak so a
  // strong snare visibly blows out the corner toward white. Slightly
  // cool tint (1.0, 1.05, 1.15) so the strobe doesn't compete with
  // warm-toned cover art — reads as light, not as paint.
  float strobeMask = pow(vCornerMask, 2.5);
  vec3 strobeColor = vec3(1.0, 1.05, 1.15);
  color += strobeColor * (strobeMask * uSnareAmount * 1.4);

  // Encode linear -> sRGB on output. The cover texture is tagged sRGB, so
  // three.js decodes it to linear when sampled, and all the math above runs
  // in linear space (correct for additive lighting). But this is a custom
  // gl_FragColor, so three.js does NOT auto-apply the output color-space
  // conversion the built-in materials get — without this encode the linear
  // values were written straight to the (sRGB) framebuffer, crushing every
  // cover ~4.8x darker than the raw file shown on the song page. Precise
  // sRGB OETF so the cube faces match the flat cover pixel-for-pixel.
  color = clamp(color, 0.0, 1.0);
  vec3 srgb = mix(1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055,
                  color * 12.92,
                  step(color, vec3(0.0031308)));
  gl_FragColor = vec4(srgb, 1.0);
}
`;

function MorphMesh({
  coverArtPath,
  animRef,
  beatRef,
  snareRef,
  hatRef,
  tomRef,
  bassPulseRef,
  hatTrailRef,
}: {
  coverArtPath: string;
  animRef: React.MutableRefObject<MeshAnimRef>;
  beatRef: React.MutableRefObject<BeatMorphRequest>;
  snareRef: React.MutableRefObject<SnarePulseRequest>;
  hatRef: React.MutableRefObject<PulseRequest>;
  tomRef: React.MutableRefObject<PulseRequest>;
  bassPulseRef: React.MutableRefObject<PulseRequest>;
  hatTrailRef: React.MutableRefObject<HatTrailEntry[]>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const morphStateRef = useRef({ amount: 0, seed: 0 });
  const snareStateRef = useRef({ amount: 0 });
  const hatStateRef = useRef({ amount: 0 });
  // Tom shake offsets the whole mesh in 3D space briefly. dx/dy are the
  // direction the cube jumps on the latest hit (set when consumed); amount
  // is the magnitude that decays. Picking a direction per hit makes
  // successive toms read as separate physical hits, not a single rumble.
  const tomStateRef = useRef({ amount: 0, dx: 0, dy: 0 });
  const bassPulseStateRef = useRef({ amount: 0 });

  // Load the cover art texture imperatively (not via useLoader) so we can
  // explicitly set crossOrigin BEFORE the request fires and apply colorSpace
  // on the first load callback. With useLoader the texture sometimes
  // initializes before colorSpace is applied, yielding either too-bright
  // colors or, in the "white square" symptom, an uninitialized sampler
  // because the WebGL upload hadn't happened by the first render.
  const texture = useMemo(() => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    const tex = loader.load(
      coverArtPath,
      (loaded) => {
        loaded.colorSpace = THREE.SRGBColorSpace;
        // Mipmaps were generating downsampled versions of the cover art
        // that bled the texture's edge pixels (often dark borders) into
        // the lower mip levels. Combined with BoxGeometry corner UVs
        // hitting exactly (0,0)/(1,1), this drew thin dark gaps at every
        // cube corner. Linear-only filtering samples the source texture
        // directly with no downsample artifacts. Anisotropy off for the
        // same reason — at corner angles it samples a wide kernel that
        // straddles the texture edge.
        loaded.minFilter = THREE.LinearFilter;
        loaded.magFilter = THREE.LinearFilter;
        loaded.generateMipmaps = false;
        loaded.anisotropy = 1;
        loaded.needsUpdate = true;
      },
      undefined,
      (err) => {
        // Visible in the browser console if the CDN ever blocks CORS
        // for the cover-art zone.
        console.warn("[CubeVisualizerMesh] texture load failed", err);
      },
    );
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }, [coverArtPath]);

  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  // Build uniforms once. THREE.ShaderMaterial holds these by reference, so
  // we mutate `.value` each frame rather than recreating the object.
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMorphAmount: { value: 0 },
      uVariantSeed: { value: 0 },
      uBass: { value: 0 },
      uSnareAmount: { value: 0 },
      uHatAmount: { value: 0 },
      uBassPulseAmount: { value: 0 },
      // 30 disabled slots; CubeVisualizer fills them each frame from
      // hatTrailRef. Sentinel age = -1 means "skip in fragment loop."
      uHatTrail: {
        value: Array.from({ length: HAT_TRAIL_CAP }, () => new THREE.Vector4(0, 0, 0, -1)),
      },
      // Pen heading at each dash's placement time. Same indexing as
      // uHatTrail; zero-length sentinel means "skip" (shader guards
      // against divide-by-zero on normalize).
      uHatTrailDir: {
        value: Array.from({ length: HAT_TRAIL_CAP }, () => new THREE.Vector2(0, 0)),
      },
      uTexture: { value: texture },
    }),
    [texture],
  );

  useFrame((state, dt) => {
    const mesh = meshRef.current;
    const mat = matRef.current;
    if (!mesh || !mat) return;

    // Apply parent's rotation accumulator. Convert deg -> rad.
    const anim = animRef.current;
    mesh.rotation.x = (anim.rx * Math.PI) / 180;
    mesh.rotation.y = (anim.ry * Math.PI) / 180;

    // Consume a pending kick: morph amount to peak + adopt new variant
    // seed. Pending flag cleared so one kick = one morph cycle.
    const beat = beatRef.current;
    const morph = morphStateRef.current;
    if (beat.pending) {
      morph.amount = Math.min(1.7, beat.intensity);
      morph.seed = beat.seed;
      beat.pending = false;
    }

    // Kick morph decay — half-life 100ms; sharp punch in/out.
    const morphDecay = Math.pow(0.5, dt / 0.10);
    morph.amount *= morphDecay;
    if (morph.amount < 0.001) morph.amount = 0;

    // Consume a pending snare: drive corner-strobe amount to peak.
    // Independent of the kick morph so backbeats that fire both
    // (kick + snare on same beat) get both effects simultaneously.
    const snare = snareRef.current;
    const snareState = snareStateRef.current;
    if (snare.pending) {
      snareState.amount = Math.min(1.2, snare.intensity);
      snare.pending = false;
    }

    // Strobe decay — half-life 70ms, faster than the kick. Airplane
    // wingtip strobes punch on and OFF fast; a slow decay would read
    // as a glow, not a strobe. After ~250ms the corners are dark.
    const snareDecay = Math.pow(0.5, dt / 0.07);
    snareState.amount *= snareDecay;
    if (snareState.amount < 0.001) snareState.amount = 0;

    // Consume a pending hat — brief rim brightness boost. Capped low so
    // dense hat patterns (16th notes throughout a chorus) feel like
    // shimmer, not strobing.
    const hat = hatRef.current;
    const hatState = hatStateRef.current;
    if (hat.pending) {
      hatState.amount = Math.min(1.0, hat.intensity);
      hat.pending = false;
    }
    // Rim decay — half-life 50ms. Hats are tightest punctuation: faster
    // than the snare strobe so 16th-note hat lines stay readable as
    // discrete events instead of smearing into a sustained glow.
    const hatDecay = Math.pow(0.5, dt / 0.05);
    hatState.amount *= hatDecay;
    if (hatState.amount < 0.001) hatState.amount = 0;

    // Consume a pending tom — cube physical shake. Direction picked from
    // the incoming seed so successive toms feel like separate hits
    // (e.g., tom fill that walks down the kit reads as the cube tossed
    // around) rather than a single sustained rumble.
    const tom = tomRef.current;
    const tomState = tomStateRef.current;
    if (tom.pending) {
      const dir = Math.floor(tom.seed * 4) % 4;
      tomState.dx = dir === 0 ? 1 : dir === 1 ? -1 : 0;
      tomState.dy = dir === 2 ? 1 : dir === 3 ? -1 : 0;
      tomState.amount = Math.min(1.0, tom.intensity);
      tom.pending = false;
    }
    // Shake decay — half-life 80ms. Cube settles fast back to center.
    const tomDecay = Math.pow(0.5, dt / 0.08);
    tomState.amount *= tomDecay;
    if (tomState.amount < 0.001) tomState.amount = 0;
    // Magnitude: 0.06 mesh units at peak — small enough not to clip out
    // of frame, big enough to read as a real jolt against the cube's
    // 1.32-unit size.
    mesh.position.x = tomState.dx * tomState.amount * 0.06;
    mesh.position.y = tomState.dy * tomState.amount * 0.06;

    // Consume a pending bass pulse — additive boost to the uBass uniform
    // that drives the breathing scale. Slower decay than the percussive
    // effects so sub-bass reads as a sustained pump, not a flick.
    const bassPulse = bassPulseRef.current;
    const bassPulseState = bassPulseStateRef.current;
    if (bassPulse.pending) {
      bassPulseState.amount = Math.min(1.0, bassPulse.intensity);
      bassPulse.pending = false;
    }
    const bassPulseDecay = Math.pow(0.5, dt / 0.20);
    bassPulseState.amount *= bassPulseDecay;
    if (bassPulseState.amount < 0.001) bassPulseState.amount = 0;

    // Push uniforms through the material's OWN uniforms object — Three.js's
    // ShaderMaterial constructor clones the uniforms prop, so mutations on
    // our local `uniforms` ref never reach the GPU. Writing through
    // mat.uniforms updates the actual values Three sends to the shader.
    const u = mat.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uMorphAmount.value = morph.amount;
    u.uVariantSeed.value = morph.seed;
    // uBass is purely FFT-driven (full-mix bass smoothing). Bass-pulse
    // hits no longer feed it — they drive uBassPulseAmount instead,
    // which is a color filter, not a spatial effect.
    u.uBass.value = anim.bass;
    u.uSnareAmount.value = snareState.amount;
    u.uHatAmount.value = hatState.amount;
    u.uBassPulseAmount.value = bassPulseState.amount;

    // Mirror the JS-side hat trail into the GLSL uniform array. Three.js
    // ShaderMaterial supports vec4[] via an array of Vector4 instances;
    // we mutate the existing entries instead of reassigning so the
    // underlying buffer Three.js uploads each frame keeps its identity.
    const trail = hatTrailRef.current;
    const slots = u.uHatTrail.value as THREE.Vector4[];
    const dirs = u.uHatTrailDir.value as THREE.Vector2[];
    for (let i = 0; i < HAT_TRAIL_CAP; i++) {
      const entry = trail[i];
      if (entry) {
        slots[i].set(entry.face, entry.u, entry.v, entry.age);
        dirs[i].set(entry.dirU, entry.dirV);
      } else {
        slots[i].set(0, 0, 0, -1);
        dirs[i].set(0, 0);
      }
    }
  });

  return (
    <mesh ref={meshRef}>
      {/* Cube 15% smaller than prior 1.55 per user spec. With camera at
          z=3.75 the diagonal fits the canvas comfortably and face-on
          apparent size is ~48% of the container. */}
      <boxGeometry args={[1.32, 1.32, 1.32, 28, 28, 28]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={uniforms}
        side={THREE.FrontSide}
        transparent={false}
      />
    </mesh>
  );
}

export function CubeVisualizerMesh({
  coverArtPath,
  animRef,
  beatRef,
  snareRef,
  hatRef,
  tomRef,
  bassPulseRef,
  hatTrailRef,
}: {
  coverArtPath: string;
  animRef: React.MutableRefObject<MeshAnimRef>;
  beatRef: React.MutableRefObject<BeatMorphRequest>;
  snareRef: React.MutableRefObject<SnarePulseRequest>;
  hatRef: React.MutableRefObject<PulseRequest>;
  tomRef: React.MutableRefObject<PulseRequest>;
  bassPulseRef: React.MutableRefObject<PulseRequest>;
  hatTrailRef: React.MutableRefObject<HatTrailEntry[]>;
}) {
  return (
    <Canvas
      // dpr capped to 2 — going higher murders perf on retina without
      // visible quality gain at this physical size. orthographic-like
      // FOV (40) lets the mesh fill the canvas without huge perspective
      // distortion that would dwarf the morph at the corners.
      dpr={[1, 2]}
      // Camera distance chosen so the cube's worst-case corner-to-corner
      // diagonal (1.55 * sqrt(3) ≈ 2.69) fits the viewport. At fov 40,
      // distance 3.75 gives viewport height ≈ 2.73 — corner diagonal
      // fits exactly with a hair of margin. Face-on apparent size is
      // 1.55/2.73 ≈ 57% of the now-full container, larger than before
      // (which was 71% of a half-size canvas = 41% of container).
      camera={{ position: [0, 0, 3.75], fov: 40 }}
      gl={{ antialias: true, alpha: true, premultipliedAlpha: false }}
      style={{ width: "100%", height: "100%", background: "transparent" }}
    >
      {/* Ambient + key light. The shader doesn't currently consume light
          uniforms (rim term is view-based) but lights are essentially free
          and let us upgrade to MeshStandardMaterial later if we want
          metallic / liquid-metal looks without rewriting. */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[2, 2, 3]} intensity={0.6} />
      <MorphMesh
        coverArtPath={coverArtPath}
        animRef={animRef}
        beatRef={beatRef}
        snareRef={snareRef}
        hatRef={hatRef}
        tomRef={tomRef}
        bassPulseRef={bassPulseRef}
        hatTrailRef={hatTrailRef}
      />
    </Canvas>
  );
}
