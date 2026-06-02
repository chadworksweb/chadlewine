"use client";

/* Transcend the Machine - Phase 0 proof-of-look.
 * Corridor-in-the-void: glowing wireframe "pixel pillars" in pure black, a
 * floor grid into fog, a distant rune to fly toward.
 * Controls (RPG, not FPS): cursor POSITION spins you - horizontal offset from
 * center = spin rate, ~20px dead zone, yaw only / level horizon (no tilt).
 * WASD/arrows move, Q/E up-down. Esc (or moving off-screen) unhooks so it
 * never spins away. Floor is solid.
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
const DEAD_PX = 20; // px from screen center before left/right spin engages
const FULL_PX = 260; // px from center at which spin reaches max rate

type Pointer = { steer: number }; // signed spin rate, -1..1
type Pillar = { x: number; z: number; h: number; w: number; accent: boolean };

function spinFromDx(dx: number): number {
  const a = Math.abs(dx);
  if (a < DEAD_PX) return 0;
  // EASE-IN ramp from the dead-zone edge to MAX at FULL_PX: gentle near center
  // so spin falls off fast as the cursor returns toward the middle (crisp stop).
  const t = Math.min(1, (a - DEAD_PX) / (FULL_PX - DEAD_PX));
  return Math.sign(dx) * Math.pow(t, 1.7);
}

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

function FlyCam({ pointer }: { pointer: { current: Pointer } }) {
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

    // Cursor-position spin (RPG feel): offset from center = spin RATE, yaw only.
    // No pitch, no roll - the view stays parallel to the ground (no diagonal tilt).
    const TURN = 1.36; // rad/sec at full deflection (15% slower)
    yaw.current -= pointer.current.steer * TURN * dt;
    const euler = new THREE.Euler(0, yaw.current, 0, "YXZ");
    camera.quaternion.setFromEuler(euler);

    // Keyboard thrust along the level facing.
    const fwd = new THREE.Vector3(0, 0, -1).applyEuler(euler);
    const right = new THREE.Vector3(1, 0, 0).applyEuler(euler);
    const ACCEL = 100;
    const v = vel.current;
    const k = keys.current;
    if (k["w"] || k["arrowup"]) v.addScaledVector(fwd, ACCEL * dt);
    if (k["s"] || k["arrowdown"]) v.addScaledVector(fwd, -ACCEL * dt);
    if (k["a"] || k["arrowleft"]) v.addScaledVector(right, -ACCEL * dt);
    if (k["d"] || k["arrowright"]) v.addScaledVector(right, ACCEL * dt);
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
.tmspike-cursor{position:fixed;left:0;top:0;width:28px;height:28px;margin:-14px 0 0 -14px;pointer-events:none;z-index:60;will-change:transform}
.tmspike-cursor::before{content:"";position:absolute;inset:0;border:1.5px solid ${CYAN};border-radius:50%;box-shadow:0 0 8px rgba(0,224,255,.6),inset 0 0 4px rgba(0,224,255,.4);transition:transform .12s ease,border-color .12s,box-shadow .12s}
.tmspike-cursor::after{content:"";position:absolute;left:50%;top:50%;width:3px;height:3px;margin:-1.5px 0 0 -1.5px;background:${CYAN};border-radius:50%;box-shadow:0 0 6px ${CYAN};transition:background .12s,box-shadow .12s}
.tmspike-cursor[data-grab="1"]::before{border-color:${MAGENTA};box-shadow:0 0 12px rgba(255,46,99,.7),inset 0 0 5px rgba(255,46,99,.4);transform:scale(1.3)}
.tmspike-cursor[data-grab="1"]::after{background:${MAGENTA};box-shadow:0 0 8px ${MAGENTA}}
.tmspike-status{display:none;position:fixed;left:50%;top:24px;transform:translateX(-50%);font-family:ui-monospace,Menlo,monospace;font-size:12px;letter-spacing:.16em;color:${MAGENTA};text-shadow:0 0 8px rgba(255,46,99,.6);pointer-events:none;user-select:none}
.tmspike-hud{position:absolute;left:24px;bottom:20px;font-family:ui-monospace,Menlo,monospace;font-size:12px;letter-spacing:.12em;color:#cdebff;text-shadow:-1px 0 ${MAGENTA},1px 0 ${CYAN};pointer-events:none;user-select:none}
.tmspike-hud b{display:block;font-size:15px;margin-bottom:6px;font-weight:600}
.tmspike-hud span{opacity:.7}
`;

export function TranscendSpike() {
  const pointer = useRef<Pointer>({ steer: 0 });
  const cursorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const hooked = useRef(true);

  useEffect(() => {
    const applyHook = () => {
      const on = hooked.current;
      if (!on) { pointer.current.steer = 0; } // unhooked: stop turning
      if (containerRef.current) containerRef.current.style.cursor = on ? "none" : "default";
      if (cursorRef.current) cursorRef.current.style.display = on ? "" : "none";
      if (statusRef.current) statusRef.current.style.display = on ? "none" : "block";
    };

    const onMove = (e: PointerEvent) => {
      if (!hooked.current) return; // unhooked: OS cursor moves freely, no steering
      const spin = spinFromDx(e.clientX - window.innerWidth / 2);
      pointer.current.steer = spin;
      const c = cursorRef.current;
      if (c) {
        c.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        c.dataset.grab = spin !== 0 ? "1" : "0";
      }
    };

    // Kill steering the instant the cursor leaves the window or the tab blurs,
    // so it never spins off when the mouse goes off-screen.
    const stopSteer = () => { pointer.current.steer = 0; };
    const onOut = (e: MouseEvent) => { if (!e.relatedTarget) stopSteer(); };
    // Esc toggles the hook (park control for testing without spinning).
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { hooked.current = !hooked.current; applyHook(); }
    };

    window.addEventListener("pointermove", onMove);
    document.addEventListener("mouseout", onOut);
    window.addEventListener("blur", stopSteer);
    window.addEventListener("keydown", onKey);
    applyHook();
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseout", onOut);
      window.removeEventListener("blur", stopSteer);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={containerRef} style={{ position: "fixed", inset: 0, background: "#000", cursor: "none", zIndex: 50 }}>
      <style>{UI_CSS}</style>
      <Canvas camera={{ fov: 75, near: 0.1, far: 500, position: [0, 0, 16] }} gl={{ antialias: true }} dpr={[1, 2]}>
        <color attach="background" args={["#000000"]} />
        <fogExp2 attach="fog" args={["#000000", 0.014]} />
        <Scene />
        <FlyCam pointer={pointer} />
      </Canvas>
      <div ref={cursorRef} className="tmspike-cursor" data-grab="0" aria-hidden="true" />
      <div ref={statusRef} className="tmspike-status">UNHOOKED &middot; press Esc to re-enter</div>
      <div className="tmspike-hud">
        <b>TRANSCEND THE MACHINE</b>
        <span>WASD / arrows move &middot; mouse spins &middot; Q/E up-down &middot; Esc unhook &middot; PHASE 0</span>
      </div>
    </div>
  );
}
