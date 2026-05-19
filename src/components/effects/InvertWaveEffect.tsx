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

interface Wave {
  cx: number;
  cy: number;
  radius: number;
  maxRadius: number;
  life: number;
}

export function InvertWaveEffect({ src, alt, className, focalX = 0.5, focalY = 0.5, zoom = 1 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number>(0);
  const wavesRef = useRef<Wave[]>([]);
  const focalRef = useRef({ x: focalX, y: focalY, z: zoom });

  useEffect(() => {
    focalRef.current = { x: focalX, y: focalY, z: zoom };
  }, [focalX, focalY, zoom]);

  const draw = useCallback(function tick() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const img = imgRef.current;
    if (!canvas || !ctx || !img || !img.complete) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    const w = canvas.width;
    const h = canvas.height;

    const crop = getCoverCropRect(img.naturalWidth, img.naturalHeight, w / h, focalRef.current.x, focalRef.current.y, focalRef.current.z);
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);

    const waves = wavesRef.current;
    if (waves.length > 0) {
      const imageData = ctx.getImageData(0, 0, w, h);
      const pixels = imageData.data;

      for (const wave of waves) {
        const innerR = Math.max(0, wave.radius - 30);
        const outerR = wave.radius;

        for (let y = Math.max(0, Math.floor(wave.cy - outerR)); y < Math.min(h, Math.ceil(wave.cy + outerR)); y++) {
          for (let x = Math.max(0, Math.floor(wave.cx - outerR)); x < Math.min(w, Math.ceil(wave.cx + outerR)); x++) {
            const dx = x - wave.cx;
            const dy = y - wave.cy;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist >= innerR && dist <= outerR) {
              const ringPos = (dist - innerR) / (outerR - innerR);
              const strength = Math.sin(ringPos * Math.PI) * wave.life;
              const i = (y * w + x) * 4;

              pixels[i] = Math.round(pixels[i] + (255 - 2 * pixels[i]) * strength);
              pixels[i + 1] = Math.round(pixels[i + 1] + (255 - 2 * pixels[i + 1]) * strength);
              pixels[i + 2] = Math.round(pixels[i + 2] + (255 - 2 * pixels[i + 2]) * strength);
            }
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);

      wavesRef.current = waves
        .map((w) => ({
          ...w,
          radius: w.radius + 4,
          life: w.life - 0.01,
        }))
        .filter((w) => w.life > 0 && w.radius < w.maxRadius);
    }

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
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const rect = container.getBoundingClientRect();
    wavesRef.current.push({
      cx: e.clientX - rect.left,
      cy: e.clientY - rect.top,
      radius: 0,
      maxRadius: Math.max(canvas.width, canvas.height),
      life: 1,
    });
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      onClick={handleClick}
      style={{ position: "relative", overflow: "hidden", cursor: "pointer" }}
    >
      <img src={src} alt={alt} style={{ width: "100%", display: "block", visibility: "hidden" }} />
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
    </div>
  );
}
