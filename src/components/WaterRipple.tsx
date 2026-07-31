"use client";

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { getCoverCropRect } from "@/lib/coverCrop";

interface WaterRippleProps {
  src: string;
  alt: string;
  className?: string;
  focalX?: number; // 0-1, defaults to 0.5
  focalY?: number; // 0-1, defaults to 0.5
  zoom?: number; // >= 1, defaults to 1
}

// Lets a caller trigger a ripple from a click that lands OUTSIDE the canvas
// (e.g. on the title overlay), so the whole slide reads as one ripple surface.
export interface WaterRippleHandle {
  splashAt: (clientX: number, clientY: number) => void;
}

export const WaterRipple = forwardRef<WaterRippleHandle, WaterRippleProps>(function WaterRipple(
  { src, alt, className, focalX = 0.5, focalY = 0.5, zoom = 1 },
  ref,
) {
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

  // THE SOURCE PIXELS, CUT ONCE. The displacement samples an undistorted copy of
  // the cropped image, and that copy depends only on the image, the crop and the
  // canvas size -- none of which change between frames. It used to be rebuilt
  // every frame: a fresh <canvas> allocated, the image redrawn into it, and
  // getImageData called on it, plus a second getImageData on the display canvas.
  // Two full readbacks and an allocation, sixty times a second, for pixels that
  // were identical every time. Profiled 2026-07-30 on the homepage, getImageData
  // alone was 48% of all main-thread time on the page.
  const srcDataRef = useRef<Uint8ClampedArray | null>(null);
  // The output buffer, reused. Seeded from the source, so the border pixels the
  // displacement loop skips are already the base image and stay correct without
  // a per-frame drawImage to lay them down.
  const outRef = useRef<ImageData | null>(null);
  // What the cached pair was cut for. Any change to size, crop or focal point
  // makes it stale.
  const srcKeyRef = useRef("");

  // How much the water is still moving. Recorded by the simulation, which is
  // already touching every cell, so it costs nothing to know. Once it falls
  // below the threshold the surface is flat and there is no reason to keep
  // redrawing it.
  const energyRef = useRef(0);
  // Whether the settled, undistorted frame has been painted. Marks the point
  // where the loop may stop.
  const settledRef = useRef(false);
  // On screen and in a visible tab. Both must hold for the loop to run.
  const onScreenRef = useRef(false);
  const runningRef = useRef(false);
  // Set by the effect below so a click can wake the loop from anywhere.
  const wakeRef = useRef<() => void>(() => {});

  const damping = 0.98;
  const resolution = 2;
  const stepsPerFrame = 3;
  // Below this peak displacement the sampling offset rounds to zero everywhere,
  // so the next frame would be pixel-identical to the settled image. Expressed
  // in the simulation's own units, where a click lands 55.
  const STILL = 0.02;

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
    // A drop is the one thing that can start the water moving, so it is also the
    // one thing that has to restart a loop that stopped because the water was
    // still.
    energyRef.current = strength;
    settledRef.current = false;
    wakeRef.current();
  }

  function stepSimulation() {
    const b1 = buf1Ref.current;
    const b2 = buf2Ref.current;
    const w = widthRef.current;
    const h = heightRef.current;
    if (!b1 || !b2) return;

    // The peak displacement left in the surface, taken on the pass that is
    // already visiting every cell. This is what lets the loop know it is done.
    let peak = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        b2[i] = (
          b1[i - 1] + b1[i + 1] +
          b1[i - w] + b1[i + w]
        ) / 2 - b2[i];
        b2[i] *= damping;
        const a = b2[i] < 0 ? -b2[i] : b2[i];
        if (a > peak) peak = a;
      }
    }
    energyRef.current = peak;

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

    const cw = canvas.width;   // device pixels (DPR-scaled)
    const ch = canvas.height;
    const w = widthRef.current;  // sim grid dims (CSS-scale derived)
    const h = heightRef.current;
    const buf = buf1Ref.current;

    if (!buf || w === 0) {
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    // DPR factor for mapping device pixels back to sim/CSS coordinates and
    // for scaling the displacement amount (which is in CSS px).
    const dpr = window.devicePixelRatio || 1;
    const stride = resolution * dpr;

    // Cut the source once, and re-cut only when the thing it was cut for
    // changes. The crop is part of the key because the focal point is a prop and
    // can move under us.
    const focal = focalRef.current;
    const crop = getCoverCropRect(
      img.naturalWidth,
      img.naturalHeight,
      cw / ch,
      focal.x,
      focal.y,
      focal.z,
    );
    const key = `${cw}x${ch}:${crop.sx},${crop.sy},${crop.sw},${crop.sh}`;
    if (srcKeyRef.current !== key || !srcDataRef.current || !outRef.current) {
      const srcCanvas = document.createElement("canvas");
      srcCanvas.width = cw;
      srcCanvas.height = ch;
      const srcCtx = srcCanvas.getContext("2d")!;
      srcCtx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, cw, ch);
      srcDataRef.current = srcCtx.getImageData(0, 0, cw, ch).data;
      // Seeded from the source so the border ring the loop below skips is
      // already the base image, and so alpha is right without being written
      // per pixel.
      const out = ctx.createImageData(cw, ch);
      out.data.set(srcDataRef.current);
      outRef.current = out;
      srcKeyRef.current = key;
      settledRef.current = false;
    }
    const srcData = srcDataRef.current;
    const imageData = outRef.current;
    const pixels = imageData.data;

    for (let s = 0; s < stepsPerFrame; s++) {
      stepSimulation();
    }

    // STILL WATER IS NOT REDRAWN. Below the threshold the displacement rounds to
    // the same pixel everywhere, so every further frame would paint an identical
    // image. One clean frame is painted to land on, and then the loop lets go of
    // the browser entirely until the next drop wakes it.
    if (energyRef.current < STILL) {
      if (!settledRef.current) {
        pixels.set(srcData);
        ctx.putImageData(imageData, 0, 0);
        settledRef.current = true;
      }
      runningRef.current = false;
      return;
    }

    for (let py = 0; py < ch; py++) {
      for (let px = 0; px < cw; px++) {
        const sx = Math.floor(px / stride);
        const sy = Math.floor(py / stride);

        if (sx <= 0 || sx >= w - 1 || sy <= 0 || sy >= h - 1) continue;

        const i = sy * w + sx;
        // Displacement is in CSS px (sim is at CSS scale); scale to device px.
        const dx = (buf[i - 1] - buf[i + 1]) * 6 * dpr;
        const dy = (buf[i - w] - buf[i + w]) * 6 * dpr;

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
      // Set canvas backing to device pixels (sharp on Retina), keep CSS
      // display size at the layout size. Simulation grid stays at CSS scale
      // so wave physics + drop radius/strength feel the same across DPRs.
      const dpr = window.devicePixelRatio || 1;
      const cssW = container.offsetWidth;
      const cssH = container.offsetHeight;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      initBuffers(cssW, cssH);
    };

    // THE LOOP ONLY RUNS WHEN THERE IS SOMEONE TO SEE IT. This effect is an
    // expensive per-pixel simulation, and it used to run from mount to unmount
    // regardless of whether it was on screen, in a visible tab, or moving at
    // all. On the homepage that put it a thousand pixels below the fold,
    // running flat out underneath the hero animatic while the page was scroll
    // locked at the top -- profiled 2026-07-30, it and its readbacks were ~80%
    // of main-thread time and the animatic was rendering at 24fps because of it.
    const start = () => {
      if (runningRef.current) return;
      if (!onScreenRef.current || document.hidden) return;
      runningRef.current = true;
      rafRef.current = requestAnimationFrame(draw);
    };
    const stop = () => {
      runningRef.current = false;
      cancelAnimationFrame(rafRef.current);
    };
    wakeRef.current = start;

    const resizeAndStart = () => {
      resize();
      // A resize invalidates the cached cut, so the settled frame has to be
      // repainted at the new size even if the water is perfectly still.
      settledRef.current = false;
      start();
    };

    img.onload = resizeAndStart;
    window.addEventListener("resize", resizeAndStart);
    resize();

    // rootMargin so a slide that is about to scroll into view has already
    // painted its settled frame by the time it arrives.
    const io = new IntersectionObserver(
      (entries) => {
        onScreenRef.current = entries[entries.length - 1].isIntersecting;
        if (onScreenRef.current) start();
        else stop();
      },
      { rootMargin: "200px" },
    );
    if (containerRef.current) io.observe(containerRef.current);

    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("resize", resizeAndStart);
      document.removeEventListener("visibilitychange", onVisibility);
      io.disconnect();
      wakeRef.current = () => {};
      stop();
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

  useImperativeHandle(ref, () => ({
    splashAt(clientX: number, clientY: number) {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      dropAt(clientX - rect.left, clientY - rect.top, 16, 55);
    },
  }), []);

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
});
