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

export function GlitchEffect({ src, alt, className, focalX = 0.5, focalY = 0.5, zoom = 1 }: Props) {
  const focalRef = useRef({ x: focalX, y: focalY, z: zoom });
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const rafRef = useRef<number>(0);
  const holdingRef = useRef(false);
  const intensityRef = useRef(0);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const prevFrameRef = useRef<ImageData | null>(null);
  const seedRef = useRef(0);

  useEffect(() => {
    focalRef.current = { x: focalX, y: focalY, z: zoom };
  }, [focalX, focalY, zoom]);

  function hash(x: number): number {
    const h = (x * 127.1 + 311.7) * 43758.5453;
    return h - Math.floor(h);
  }

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

    // Ramp intensity
    if (holdingRef.current) {
      intensityRef.current = Math.min(1, intensityRef.current + 0.025);
    } else {
      intensityRef.current = Math.max(0, intensityRef.current - 0.06);
    }

    const intensity = intensityRef.current;

    // Base image — cover-crop with focal to preserve aspect.
    const crop = getCoverCropRect(img.naturalWidth, img.naturalHeight, w / h, focalRef.current.x, focalRef.current.y, focalRef.current.z);
    ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);

    if (intensity < 0.01) {
      prevFrameRef.current = null;
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    seedRef.current += 1;
    const seed = seedRef.current;
    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;

    const imageData = ctx.getImageData(0, 0, w, h);
    const pixels = imageData.data;
    const src2 = new Uint8ClampedArray(pixels);

    // --- Layer 1: Horizontal scanline displacement ---
    // Every few rows get shifted horizontally, stronger near cursor Y
    const bandHeight = 2 + Math.floor(hash(seed * 0.1) * 6);
    for (let y = 0; y < h; y++) {
      const bandIndex = Math.floor(y / bandHeight);
      const rowNoise = hash(bandIndex + seed * 13.7) * 2 - 1;
      const distY = Math.abs(y / h - my);
      const localIntensity = (0.12 + 0.88 * (1 - Math.min(1, distY / 0.35))) * intensity;

      // Base displacement
      let shift = Math.round(rowNoise * 25 * localIntensity);

      // Occasional big glitch bands (~5% of bands)
      if (hash(bandIndex + seed * 47.3) > 0.95) {
        shift += Math.round(rowNoise * 80 * intensity);
      }

      if (shift === 0) continue;

      for (let x = 0; x < w; x++) {
        const srcX = Math.max(0, Math.min(w - 1, x + shift));
        const di = (y * w + x) * 4;
        const si = (y * w + srcX) * 4;
        pixels[di] = src2[si];
        pixels[di + 1] = src2[si + 1];
        pixels[di + 2] = src2[si + 2];
      }
    }

    // --- Layer 2: RGB channel separation ---
    // Each channel offsets differently, stronger near cursor
    const src3 = new Uint8ClampedArray(pixels);
    const angleR = hash(seed * 3.1) * Math.PI * 2;
    const angleB = hash(seed * 7.3) * Math.PI * 2;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = x / w;
        const ny = y / h;
        const dist2D = Math.sqrt((nx - mx) ** 2 + (ny - my) ** 2);
        const localI = (0.1 + 0.9 * (1 - Math.min(1, dist2D / 0.4))) * intensity;

        const amount = Math.round(12 * localI);
        if (amount < 1) continue;

        const di = (y * w + x) * 4;

        // Red channel offset
        const rxOff = Math.round(Math.cos(angleR) * amount);
        const ryOff = Math.round(Math.sin(angleR) * amount);
        const rsx = Math.max(0, Math.min(w - 1, x + rxOff));
        const rsy = Math.max(0, Math.min(h - 1, y + ryOff));
        pixels[di] = src3[(rsy * w + rsx) * 4];

        // Blue channel offset (opposite-ish direction)
        const bxOff = Math.round(Math.cos(angleB) * amount);
        const byOff = Math.round(Math.sin(angleB) * amount);
        const bsx = Math.max(0, Math.min(w - 1, x + bxOff));
        const bsy = Math.max(0, Math.min(h - 1, y + byOff));
        pixels[di + 2] = src3[(bsy * w + bsx) * 4 + 2];
      }
    }

    // --- Layer 3: Block corruption (denser near cursor) ---
    const src4 = new Uint8ClampedArray(pixels);
    const blockSize = 8 + Math.floor(hash(seed * 11.3) * 24);

    for (let by = 0; by < h; by += blockSize) {
      for (let bx = 0; bx < w; bx += blockSize) {
        const bnx = (bx + blockSize / 2) / w;
        const bny = (by + blockSize / 2) / h;
        const blockDist = Math.sqrt((bnx - mx) ** 2 + (bny - my) ** 2);

        // Threshold: lower near cursor = more blocks corrupt
        const threshold = 0.6 + 0.35 * Math.min(1, blockDist / 0.4);
        const blockNoise = hash(Math.floor(bx / blockSize) * 100 + Math.floor(by / blockSize) + seed * 31.7);

        if (blockNoise < threshold / intensity) continue;

        // Corrupt: shift block source
        const shiftX = Math.round((hash(blockNoise * 200 + seed) - 0.5) * 150 * intensity);
        const shiftY = Math.round((hash(blockNoise * 300 + seed) - 0.5) * 60 * intensity);

        for (let y = by; y < Math.min(by + blockSize, h); y++) {
          for (let x = bx; x < Math.min(bx + blockSize, w); x++) {
            const ssx = Math.max(0, Math.min(w - 1, x + shiftX));
            const ssy = Math.max(0, Math.min(h - 1, y + shiftY));
            const di = (y * w + x) * 4;
            const si = (ssy * w + ssx) * 4;
            pixels[di] = src4[si];
            pixels[di + 1] = src4[si + 1];
            pixels[di + 2] = src4[si + 2];
          }
        }
      }
    }

    // --- Layer 3.5: Epicenter zone — chunky displaced blocks radiating from cursor ---
    if (holdingRef.current) {
      const src5 = new Uint8ClampedArray(pixels);
      const epicenterRadius = 200 * intensity;
      const zoneCount = Math.floor(3 + 5 * intensity);

      for (let z = 0; z < zoneCount; z++) {
        const zHash1 = hash(z * 17.3 + seed * 5.7);
        const zHash2 = hash(z * 31.1 + seed * 9.3);
        const zHash3 = hash(z * 47.7 + seed * 2.1);
        const zHash4 = hash(z * 61.3 + seed * 7.9);

        // Random position within epicenter radius of cursor
        const angle = zHash1 * Math.PI * 2;
        const dist = zHash2 * epicenterRadius;
        const zx = Math.round(mx * w + Math.cos(angle) * dist);
        const zy = Math.round(my * h + Math.sin(angle) * dist);
        const zw = 10 + Math.floor(zHash3 * 30 * intensity);
        const zh = 10 + Math.floor(zHash4 * 30 * intensity);

        const scX = Math.round((hash(zHash1 * 200 + seed) - 0.5) * 250 * intensity);
        const scY = Math.round((hash(zHash2 * 300 + seed) - 0.5) * 250 * intensity);

        const startX = Math.max(0, zx - zw / 2);
        const endX = Math.min(w, zx + zw / 2);
        const startY = Math.max(0, zy - zh / 2);
        const endY = Math.min(h, zy + zh / 2);

        for (let y = startY; y < endY; y++) {
          for (let x = startX; x < endX; x++) {
            const ssx = Math.max(0, Math.min(w - 1, x + scX));
            const ssy = Math.max(0, Math.min(h - 1, y + scY));
            const di = (y * w + x) * 4;
            const si = (ssy * w + ssx) * 4;
            // Channel split on the scatter
            const ch = Math.floor(hash(z * 83.1 + seed) * 3);
            if (ch === 0) {
              pixels[di] = src5[si];
            } else if (ch === 1) {
              pixels[di + 1] = src5[si + 1];
            } else {
              pixels[di] = src5[si];
              pixels[di + 1] = src5[si + 1];
              pixels[di + 2] = src5[si + 2];
            }
          }
        }
      }
    }

    // --- Layer 4: Temporal feedback (ghost of previous frame) ---
    if (prevFrameRef.current && prevFrameRef.current.width === w && prevFrameRef.current.height === h) {
      const prev = prevFrameRef.current.data;
      const feedbackBase = 0.1 * intensity;
      for (let i = 0; i < pixels.length; i += 4) {
        const px = (i / 4) % w;
        const py = Math.floor((i / 4) / w);
        const dist = Math.sqrt(((px / w) - mx) ** 2 + ((py / h) - my) ** 2);
        const fb = feedbackBase + 0.25 * intensity * (1 - Math.min(1, dist / 0.3));
        pixels[i] = Math.round(pixels[i] * (1 - fb) + prev[i] * fb);
        pixels[i + 1] = Math.round(pixels[i + 1] * (1 - fb) + prev[i + 1] * fb);
        pixels[i + 2] = Math.round(pixels[i + 2] * (1 - fb) + prev[i + 2] * fb);
      }
    }

    // --- Layer 5: Noise + occasional static lines ---
    for (let y = 0; y < h; y++) {
      // Full-width static line (~0.5% of rows)
      if (hash(y + seed * 97.1) > 0.995) {
        const lineVal = Math.floor(hash(y + seed * 53.3) * 255);
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          pixels[i] = lineVal;
          pixels[i + 1] = lineVal;
          pixels[i + 2] = lineVal;
        }
        continue;
      }

      // Subtle noise grain
      for (let x = 0; x < w; x += 2) {
        const grain = (hash(x * 0.1 + y * 0.3 + seed * 0.7) - 0.5) * 20 * intensity;
        const i = (y * w + x) * 4;
        pixels[i] += grain;
        pixels[i + 1] += grain;
        pixels[i + 2] += grain;
      }
    }

    // Save for temporal feedback
    prevFrameRef.current = new ImageData(new Uint8ClampedArray(pixels), w, h);

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
      prevFrameRef.current = null;
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

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    mouseRef.current.x = (e.clientX - rect.left) / rect.width;
    mouseRef.current.y = (e.clientY - rect.top) / rect.height;
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      onMouseDown={() => { holdingRef.current = true; }}
      onMouseUp={() => { holdingRef.current = false; }}
      onMouseLeave={() => { holdingRef.current = false; }}
      onMouseMove={handleMouseMove}
      style={{ position: "relative", overflow: "hidden", cursor: "pointer" }}
    >
      <img src={src} alt={alt} style={{ width: "100%", display: "block", visibility: "hidden" }} />
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
    </div>
  );
}
