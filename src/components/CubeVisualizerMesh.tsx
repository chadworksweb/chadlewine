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
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);

  // Per-variant pattern. Frequency dropped HARD (0.25-0.6) so each face
  // shows roughly one continuous wave / bulge, not multiple ripples.
  // At freq 0.4 over a 1.32-unit cube, the noise period across a face is
  // wider than the face itself — only a partial wave per face = single
  // smooth convex bulge.
  float freq      = mix(0.25, 0.6, fract(uVariantSeed * 0.731));
  float timeOff   = uVariantSeed * 117.0;
  float amp       = 0.18;

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

  // Final displacement: only along radial, only when edgeMask > 0, only
  // during the morph window.
  vec3 scaled = position * (1.0 + bassPump);
  vec3 displaced = scaled + radial * (n * amp * uMorphAmount * edgeMask);

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  vViewPos = mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

// Fragment shader: sample the cover art texture and add a subtle rim
// highlight so the silhouette reads as a 3D mesh, not a flat decal.
const FRAGMENT_SHADER = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewPos;

uniform sampler2D uTexture;
uniform float uMorphAmount;

void main() {
  vec4 tex = texture2D(uTexture, vUv);

  // Diagnostic: if the texture sample is effectively black (uninitialized
  // sampler or texture not yet uploaded), draw a UV gradient instead of
  // pure black/white so the mesh is at least debuggable visually.
  vec3 base = tex.rgb;
  if (dot(base, vec3(1.0)) < 0.02) {
    base = vec3(vUv.x, vUv.y, 0.6);
  }

  // Cheap rim term — view direction is roughly -z in view space.
  vec3 viewDir = normalize(-vViewPos);
  float ndv = max(0.0, dot(normalize(vNormal), viewDir));
  float rim = pow(1.0 - ndv, 2.4);

  vec3 color = base + rim * (0.12 + uMorphAmount * 0.25);
  gl_FragColor = vec4(color, 1.0);
}
`;

function MorphMesh({
  coverArtPath,
  animRef,
  beatRef,
}: {
  coverArtPath: string;
  animRef: React.MutableRefObject<MeshAnimRef>;
  beatRef: React.MutableRefObject<BeatMorphRequest>;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial>(null);
  const morphStateRef = useRef({ amount: 0, seed: 0 });

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
        loaded.anisotropy = 8;
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

    // Consume a pending beat: kick morph amount to peak and adopt the
    // new variant seed. CubeVisualizer's tick sets pending=true; we
    // clear it so a single beat triggers exactly one morph cycle.
    const beat = beatRef.current;
    const morph = morphStateRef.current;
    if (beat.pending) {
      morph.amount = Math.min(1.4, beat.intensity);
      morph.seed = beat.seed;
      beat.pending = false;
    }

    // Snappy decay — half-life 100ms so each beat punches in and out
    // cleanly without a lingering wave. After ~350ms morph is baseline.
    const decay = Math.pow(0.5, dt / 0.10);
    morph.amount *= decay;
    if (morph.amount < 0.001) morph.amount = 0;

    // Push uniforms through the material's OWN uniforms object — Three.js's
    // ShaderMaterial constructor clones the uniforms prop, so mutations on
    // our local `uniforms` ref never reach the GPU. Writing through
    // mat.uniforms updates the actual values Three sends to the shader.
    const u = mat.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uMorphAmount.value = morph.amount;
    u.uVariantSeed.value = morph.seed;
    u.uBass.value = anim.bass;
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
        side={THREE.DoubleSide}
        transparent={false}
      />
    </mesh>
  );
}

export function CubeVisualizerMesh({
  coverArtPath,
  animRef,
  beatRef,
}: {
  coverArtPath: string;
  animRef: React.MutableRefObject<MeshAnimRef>;
  beatRef: React.MutableRefObject<BeatMorphRequest>;
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
      />
    </Canvas>
  );
}
