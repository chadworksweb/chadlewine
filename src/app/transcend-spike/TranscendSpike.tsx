"use client";

/* Transcend the Machine - Phase 0 proof-of-look.
 * Corridor-in-the-void: glowing wireframe "pixel pillars" in pure black, a
 * floor grid into fog, a distant rune to fly toward.
 * Controls (keyboard only, Doom + Minecraft mashup): W/S or up/down move
 * forward/back, A/D strafe (Minecraft), left/right TURN (Doom), Q/E fly up/down.
 * No mouse. Turn has zero momentum - stops the instant you release. Level
 * horizon, solid floor.
 * Deferred to Phase 1: UnrealBloom, fractal-skinned pillars, real beat_data. */

import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const CYAN = "#00e0ff";
const MAGENTA = "#ff2e63";
const FLOOR_Y = -3;
const MIN_Y = FLOOR_Y + 1.4; // camera eye height - cannot drop through the floor
const ROWS = 30;
const GAP = 8.5;
const AISLE = 8;
const RUNE_Z = -ROWS * GAP - 24;
const TURN_RATE = 1.8; // rad/sec while a turn key is held
const ACCEL = 100; // thrust

type Pillar = { x: number; z: number; h: number; w: number; accent: boolean };

function buildPillars(): Pillar[] {
  const out: Pillar[] = [];
  for (let i = 0; i < ROWS; i++) {
    const z = -i * GAP;
    const leftDoor = i % 8 === 4; // wall gaps read as doorways
    const rightDoor = i % 8 === 0 && i > 0;
    if (!leftDoor)
      out.push({ x: -(AISLE + Math.random() * 1.5), z, h: 11 + Math.random() * 12, w: 1.6 + Math.random() * 1.2, accent: i % 8 === 5 });
    if (!rightDoor)
      out.push({ x: AISLE + Math.random() * 1.5, z, h: 11 + Math.random() * 12, w: 1.6 + Math.random() * 1.2, accent: i % 8 === 1 });
    if (i % 5 === 2) {
      out.push({ x: -3, z, h: 1.6, w: 2, accent: false });
      out.push({ x: 3, z, h: 1.6, w: 2, accent: false });
    }
  }
  return out;
}

function Scene() {
  const pillars = useMemo(buildPillars, []);
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), []);
  const rune = useMemo(() => new THREE.EdgesGeometry(new THREE.OctahedronGeometry(2.4, 0)), []);

  const cyanMat = useMemo(
    () => new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
    []
  );
  const magMat = useMemo(
    () => new THREE.LineBasicMaterial({ color: MAGENTA, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
    []
  );
  const runeMat = useMemo(
    () => new THREE.LineBasicMaterial({ color: MAGENTA, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }),
    []
  );
  const runeRef = useRef<THREE.LineSegments>(null);

  // Slow ambient breath (placeholder until beat_data). ~9s period, gentle swell.
  useFrame(({ clock }) => {
    const breath = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 0.7);
    cyanMat.opacity = 0.5 + 0.32 * breath;
    magMat.opacity = 0.55 + 0.3 * breath;
    runeMat.opacity = 0.6 + 0.35 * breath;
    if (runeRef.current) {
      runeRef.current.rotation.y += 0.006;
      runeRef.current.rotation.x += 0.0025;
    }
  });

  return (
    <group>
      <gridHelper args={[600, 120, "#0b4a57", "#072730"]} position={[0, FLOOR_Y, -90]} />
      {pillars.map((p, i) => (
        <lineSegments
          key={i}
          geometry={edges}
          material={p.accent ? magMat : cyanMat}
          position={[p.x, FLOOR_Y + p.h / 2, p.z]}
          scale={[p.w, p.h, p.w]}
        />
      ))}
      <lineSegments ref={runeRef} geometry={rune} material={runeMat} position={[0, 1, RUNE_Z]} />
    </group>
  );
}

function FlyCam() {
  const { camera } = useThree();
  const keys = useRef<Record<string, boolean>>({});
  const yaw = useRef(0);
  const vel = useRef(new THREE.Vector3());

  useEffect(() => {
    camera.position.set(0, 0, 16);
    const setKey = (down: boolean) => (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keys.current[k] = down;
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " ", "w", "a", "s", "d", "q", "e"].includes(k)) e.preventDefault();
    };
    const kd = setKey(true);
    const ku = setKey(false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, [camera]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const k = keys.current;

    // Turn (arrows): rotate while held, zero momentum - stops on release.
    if (k["arrowleft"]) yaw.current += TURN_RATE * dt;
    if (k["arrowright"]) yaw.current -= TURN_RATE * dt;
    const euler = new THREE.Euler(0, yaw.current, 0, "YXZ"); // yaw only, level horizon
    camera.quaternion.setFromEuler(euler);

    // Move: forward/back along facing, A/D strafe, Q/E vertical.
    const fwd = new THREE.Vector3(0, 0, -1).applyEuler(euler);
    const right = new THREE.Vector3(1, 0, 0).applyEuler(euler);
    const v = vel.current;
    if (k["w"] || k["arrowup"]) v.addScaledVector(fwd, ACCEL * dt);
    if (k["s"] || k["arrowdown"]) v.addScaledVector(fwd, -ACCEL * dt);
    if (k["a"]) v.addScaledVector(right, -ACCEL * dt); // strafe left
    if (k["d"]) v.addScaledVector(right, ACCEL * dt); // strafe right
    if (k["q"]) v.y -= ACCEL * dt;
    if (k["e"]) v.y += ACCEL * dt;
    v.multiplyScalar(0.84);
    if (v.lengthSq() > 34 * 34) v.setLength(34);
    camera.position.addScaledVector(v, dt);
    if (camera.position.y < MIN_Y) { camera.position.y = MIN_Y; if (v.y < 0) v.y = 0; } // floor: no falling through
  });

  return null;
}

const UI_CSS = `
.tmspike-hud{position:absolute;left:24px;bottom:20px;font-family:ui-monospace,Menlo,monospace;font-size:12px;letter-spacing:.12em;color:#cdebff;text-shadow:-1px 0 ${MAGENTA},1px 0 ${CYAN};pointer-events:none;user-select:none}
.tmspike-hud b{display:block;font-size:15px;margin-bottom:6px;font-weight:600}
.tmspike-hud span{opacity:.7}
`;

export function TranscendSpike() {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", cursor: "none", zIndex: 50 }}>
      <style>{UI_CSS}</style>
      <Canvas camera={{ fov: 75, near: 0.1, far: 500, position: [0, 0, 16] }} gl={{ antialias: true }} dpr={[1, 2]}>
        <color attach="background" args={["#000000"]} />
        <fogExp2 attach="fog" args={["#000000", 0.014]} />
        <Scene />
        <FlyCam />
      </Canvas>
      <div className="tmspike-hud">
        <b>TRANSCEND THE MACHINE</b>
        <span>W/S or up/down move &middot; A/D strafe &middot; left/right turn &middot; Q/E up-down &middot; PHASE 0</span>
      </div>
    </div>
  );
}
