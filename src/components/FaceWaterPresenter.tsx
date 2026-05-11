"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { CubeWaterRenderer } from "./CubeWaterRenderer";

interface Props {
  renderer: CubeWaterRenderer | null;
  faceIdx: number;
  active: boolean;
  className?: string;
  style?: CSSProperties;
}

// Per-face presentation canvas. Reads its tile from the shared atlas
// each frame via drawImage. Cheap — the heavy lifting (sim + WebGL
// render) happens once per cube in CubeWaterRenderer.
export function FaceWaterPresenter({ renderer, faceIdx, active, className, style }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!renderer || !active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

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

    const draw = () => {
      if (renderer.isFaceReady(faceIdx)) {
        const { sx, sy, sw, sh } = renderer.faceSourceRect(faceIdx);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(renderer.atlas, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [renderer, faceIdx, active]);

  return <canvas ref={canvasRef} className={className} style={style} aria-hidden="true" />;
}
