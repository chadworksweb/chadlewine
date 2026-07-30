"use client";

/* Phosphor bloom - the hero ingredient (Section 5). Emissive wireframe + an
 * UnrealBloomPass on the composer is what makes it read as "that 1983 vector
 * cabinet" instantly. Wired the manual-render way (no @react-three/post-
 * processing dependency): a priority>0 useFrame takes over rendering and runs
 * the EffectComposer pipeline. The bloom strength pumps with the song - the
 * void brightens on the bass pulse + kick, and floors at the level's charge. */

import { useEffect, useMemo, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import type { Pulse } from "./levels";

const BASE_STRENGTH = 0.5;

export function BloomComposer({ pulseRef }: { pulseRef: React.MutableRefObject<Pulse> }) {
  const { gl, scene, camera, size } = useThree();
  const bloomRef = useRef<UnrealBloomPass | null>(null);

  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(size.width, size.height),
      BASE_STRENGTH, // strength
      0.55, // radius
      0.32, // luminance threshold - only the bright neon lines bloom
    );
    bloomRef.current = bloom;
    c.addPass(bloom);
    c.addPass(new OutputPass());
    return c;
    // gl/scene/camera are stable across the canvas lifetime; size is handled
    // by the resize effect below so the composer is built once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, camera]);

  useEffect(() => {
    composer.setSize(size.width, size.height);
    composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  }, [composer, size]);

  useEffect(() => () => composer.dispose(), [composer]);

  // Priority 1: takes over the render loop from R3F and renders the composer.
  useFrame(() => {
    const bloom = bloomRef.current;
    if (bloom) {
      const p = pulseRef.current;
      bloom.strength =
        BASE_STRENGTH + p.charge * 0.18 + p.bassPulse * 0.5 + p.kick * 0.18 + p.chord * 0.22;
    }
    composer.render();
  }, 1);

  return null;
}
