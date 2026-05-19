"use client";

import { useEffect, useRef, useCallback } from "react";
import { getCoverCropRect } from "@/lib/coverCrop";

interface WaterRippleProps {
  src: string;
  alt: string;
  className?: string;
  focalX?: number; // 0-1, defaults to 0.5
  focalY?: number; // 0-1, defaults to 0.5
  zoom?: number; // >= 1, defaults to 1
}

export function WaterRipple({ src, alt, className, focalX = 0.5, focalY = 0.5, zoom = 1 }: WaterRippleProps) {
  const focalRef = useRef({ x: focalX, y: focalY, z: zoom });
  focalRef.current = { x: focalX, y: focalY, z: zoom };
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number>(0);

  // Water simulation buffers
  const buf1Ref = useRef<Float32Array | null>(null);
  const buf2Ref = useRef<Float32Array | null>(null);
  const widthRef = useRef(0);
  const heightRef = useRef(0);

  const damping = 0.98;
  const resolution = 2;
  const stepsPerFrame = 3;

  function initBuffers(w: number, h: number) {
    const sw = Math.floor(w / resolution);
    const sh = Math.floor(h / resolution);
    widthRef.current = sw;
    heightRef.current = sh;
    buf1Ref.current = new Float32Array(sw * sh);
    buf2Ref.current = new Float32Array(sw * sh);
  }

  function dropAt(x: number, y: number, radius: number, strength: number) {
    const buf = buf1Ref.current;
    const w = widthRef.current;
    const h = heightRef.current;
    if (!buf) return;

    const sx = Math.floor(x / resolution);
    const sy = Math.floor(y / resolution);
    const sr = Math.floor(radius / resolution);

    for (let dy = -sr; dy <= sr; dy++) {
      for (let dx = -sr; dx <= sr; dx++) {
        const px = sx + dx;
        const py = sy + dy;
        if (px < 0 || px >= w || py < 0 || py >= h) continue;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > sr) continue;
        const factor = Math.cos((dist / sr) * Math.PI * 0.5);
        buf[py * w + px] += strength * factor;
      }
    }
  }

  function stepSimulation() {
    const b1 = buf1Ref.current;
    const b2 = buf2Ref.current;
    const w = widthRef.current;
    const h = heightRef.current;
    if (!b1 || !b2) return;

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        b2[i] = (
          b1[i - 1] + b1[i + 1] +
          b1[i - w] + b1[i + w]
        ) / 2 - b2[i];
        b2[i] *= damping;
      }
    }

    // Swap
    buf1Ref.current = b2;
    buf2Ref.current = b1;
  }

  const draw = useCallback(function tick() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const img = imgRef.current;
    if (!canvas || !ctx || !img || !img.complete) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    const cw = canvas.width;
    const ch = canvas.height;
    const w = widthRef.current;
    const h = heightRef.current;
    const buf = buf1Ref.current;

    if (!buf || w === 0) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    for (let s = 0; s < stepsPerFrame; s++) {
      stepSimulation();
    }

    // Draw base image with cover-crop + focal point (preserves source aspect).
    const crop = getCoverCropRect(
      img.naturalWidth,
      img.naturalHeight,
      cw / ch,
      focalRef.current.x,
      focalRef.current.y,
      focalRef.current.z,
    );
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, cw, ch);

    // Apply displacement
    const imageData = ctx.getImageData(0, 0, cw, ch);
    const pixels = imageData.data;

    // Source pixels for sampling
    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = cw;
    srcCanvas.height = ch;
    const srcCtx = srcCanvas.getContext("2d")!;
    srcCtx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, cw, ch);
    const srcData = srcCtx.getImageData(0, 0, cw, ch).data;

    for (let py = 0; py < ch; py++) {
      for (let px = 0; px < cw; px++) {
        const sx = Math.floor(px / resolution);
        const sy = Math.floor(py / resolution);

        if (sx <= 0 || sx >= w - 1 || sy <= 0 || sy >= h - 1) continue;

        const i = sy * w + sx;
        const dx = (buf[i - 1] - buf[i + 1]) * 6;
        const dy = (buf[i - w] - buf[i + w]) * 6;

        let sampX = Math.round(px + dx);
        let sampY = Math.round(py + dy);
        sampX = Math.max(0, Math.min(cw - 1, sampX));
        sampY = Math.max(0, Math.min(ch - 1, sampY));

        const dst = (py * cw + px) * 4;
        const src2 = (sampY * cw + sampX) * 4;
        pixels[dst] = srcData[src2];
        pixels[dst + 1] = srcData[src2 + 1];
        pixels[dst + 2] = srcData[src2 + 2];
      }
    }

    ctx.putImageData(imageData, 0, 0);

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    imgRef.current = img;

    const resize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      canvas.width = container.offsetWidth;
      canvas.height = container.offsetHeight;
      initBuffers(canvas.width, canvas.height);
    };

    img.onload = resize;
    window.addEventListener("resize", resize);
    resize();

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [src, draw]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    dropAt(x, y, 16, 55);
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      onClick={handleClick}
      style={{ position: "relative", overflow: "hidden", cursor: "pointer" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- invisible sizer for canvas overlay; Image optimization N/A */}
      <img src={src} alt={alt} style={{ width: "100%", display: "block", visibility: "hidden" }} />
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
    </div>
  );
}
