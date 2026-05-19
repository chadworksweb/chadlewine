"use client";

import { useEffect, useRef, useCallback } from "react";
import { getCoverCropRect } from "@/lib/coverCrop";

interface Props {
  src: string;
  alt: string;
  className?: string;
  focalX?: number;
  focalY?: number;
  zoom?: number;
}

const SEGMENTS = 8;
const STEP = (Math.PI * 2) / SEGMENTS;

export function KaleidoscopeEffect({ src, alt, className, focalX = 0.5, focalY = 0.5, zoom = 1 }: Props) {
  const focalRef = useRef({ x: focalX, y: focalY, z: zoom });
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const patternRef = useRef<CanvasPattern | null>(null);
  const rafRef = useRef<number>(0);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const targetRef = useRef({ x: 0.5, y: 0.5 });
  const activeRef = useRef(false);
  const blendRef = useRef(0);

  useEffect(() => {
    focalRef.current = { x: focalX, y: focalY, z: zoom };
  }, [focalX, focalY, zoom]);

  const draw = useCallback(function tick() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const img = imgRef.current;
    const pattern = patternRef.current;
    if (!canvas || !ctx || !img || !img.complete) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    const w = canvas.width;
    const h = canvas.height;

    if (activeRef.current) {
      blendRef.current = Math.min(1, blendRef.current + 0.06);
    } else {
      blendRef.current = Math.max(0, blendRef.current - 0.025);
    }

    const blend = blendRef.current;

    // Base image — cover-crop with focal to preserve aspect.
    const crop = getCoverCropRect(img.naturalWidth, img.naturalHeight, w / h, focalRef.current.x, focalRef.current.y, focalRef.current.z);
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);

    if (blend < 0.01 || !pattern) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.sqrt(cx * cx + cy * cy);

    // Lerp toward target for smooth, slow response
    const lerp = 0.04;
    mouseRef.current.x += (targetRef.current.x - mouseRef.current.x) * lerp;
    mouseRef.current.y += (targetRef.current.y - mouseRef.current.y) * lerp;

    const offsetX = mouseRef.current.x * img.width;
    const offsetY = mouseRef.current.y * img.height;

    // Scale so the full image fills each wedge
    const scale = Math.max(w, h) / Math.min(img.width, img.height) * 0.35;

    // Draw kaleidoscope to offscreen then blend
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const octx = off.getContext("2d")!;
    octx.fillStyle = pattern;

    for (let i = 0; i < SEGMENTS; i++) {
      octx.save();
      octx.translate(cx, cy);
      octx.rotate(i * STEP);

      // Clip to pie wedge — slightly oversized to prevent seam gaps
      octx.beginPath();
      octx.moveTo(0, 0);
      octx.arc(0, 0, radius, -STEP * 0.51, STEP * 0.51);
      octx.closePath();
      octx.clip();

      octx.rotate(Math.PI / 2);

      // Scale image to fill
      octx.scale(scale, scale);

      // Mirror alternating slices — THIS is what makes it a kaleidoscope
      if (i % 2 === 1) {
        octx.scale(-1, 1);
      }

      // Pan based on mouse position
      octx.translate(-offsetX, -offsetY);

      octx.fill();
      octx.restore();
    }

    ctx.globalAlpha = blend;
    ctx.drawImage(off, 0, 0);
    ctx.globalAlpha = 1;

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    imgRef.current = img;

    img.onload = () => {
      // Create repeating pattern from image
      const patCanvas = document.createElement("canvas");
      patCanvas.width = img.width;
      patCanvas.height = img.height;
      const pctx = patCanvas.getContext("2d")!;
      pctx.drawImage(img, 0, 0);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          patternRef.current = ctx.createPattern(patCanvas, "repeat");
        }
      }
    };

    const resize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      canvas.width = container.offsetWidth;
      canvas.height = container.offsetHeight;
      // Recreate pattern after resize (new context)
      if (img.complete) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const patCanvas = document.createElement("canvas");
          patCanvas.width = img.width;
          patCanvas.height = img.height;
          const pctx = patCanvas.getContext("2d")!;
          pctx.drawImage(img, 0, 0);
          patternRef.current = ctx.createPattern(patCanvas, "repeat");
        }
      }
    };

    img.onload = () => {
      resize();
    };
    window.addEventListener("resize", resize);
    resize();
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [src, draw]);

  const handleMouseDown = useCallback(() => { activeRef.current = true; }, []);
  const handleMouseUp = useCallback(() => { activeRef.current = false; }, []);
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    targetRef.current.x = (e.clientX - rect.left) / rect.width;
    targetRef.current.y = (e.clientY - rect.top) / rect.height;
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onMouseMove={handleMouseMove}
      style={{ position: "relative", overflow: "hidden", cursor: "grab" }}
    >
      <img src={src} alt={alt} style={{ width: "100%", display: "block", visibility: "hidden" }} />
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
    </div>
  );
}
