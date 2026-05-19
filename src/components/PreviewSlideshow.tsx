"use client";

import { useEffect, useRef, useCallback } from "react";

const SLIDES = [
  { src: "/preview-art/flight-ready_preview.jpg", alt: "Flight Ready — digital art by Chad Lewine" },
  { src: "/preview-art/elemental-ways_preview.jpg", alt: "Elemental Ways — digital art by Chad Lewine" },
  { src: "/preview-art/urgent-arbiter_preview.jpg", alt: "Urgent Arbiter — digital art by Chad Lewine" },
];

type TransitionType = "ripple" | "glitch" | "kaleidoscope";
const TRANSITION_ORDER: TransitionType[] = ["ripple", "glitch", "kaleidoscope"];

const SLIDE_DURATION = 4000;
const TRANSITION_DURATION = 4000;

/** Draw image with object-fit: cover behavior */
function coverDraw(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  cw: number,
  ch: number
) {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const canvasRatio = cw / ch;
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
  if (imgRatio > canvasRatio) {
    sw = img.naturalHeight * canvasRatio;
    sx = (img.naturalWidth - sw) / 2;
  } else {
    sh = img.naturalWidth / canvasRatio;
    sy = (img.naturalHeight - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
}

/** Render image to pixel buffer at canvas size */
function getPixels(img: HTMLImageElement, w: number, h: number): Uint8ClampedArray {
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  const octx = off.getContext("2d")!;
  coverDraw(octx, img, w, h);
  return octx.getImageData(0, 0, w, h).data;
}

function hash(x: number): number {
  const h = (x * 127.1 + 311.7) * 43758.5453;
  return h - Math.floor(h);
}

/** Smooth ease-in-out curve */
function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function PreviewSlideshow() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const allLoadedRef = useRef(false);

  const currentIndexRef = useRef(0);
  const transitionActiveRef = useRef(false);
  const transitionStartRef = useRef(0);
  const transitionTypeIndexRef = useRef(-1);
  const nextIndexRef = useRef(1);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ripple simulation buffers — 4x downscale for performance
  const ripBuf1Ref = useRef<Float32Array | null>(null);
  const ripBuf2Ref = useRef<Float32Array | null>(null);
  const ripWidthRef = useRef(0);
  const ripHeightRef = useRef(0);
  const rippleDropIndexRef = useRef(0);
  // Cached offscreen canvases — drawn once per transition pair
  const ripOffOutRef = useRef<HTMLCanvasElement | null>(null);
  const ripOffInRef = useRef<HTMLCanvasElement | null>(null);
  const ripCacheKeyRef = useRef("");

  // Glitch seed
  const glitchSeedRef = useRef(0);

  /** Schedule the next transition after a full hold period */
  function scheduleNextTransition() {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      if (!allLoadedRef.current) return;
      const next = (currentIndexRef.current + 1) % SLIDES.length;
      nextIndexRef.current = next;
      transitionActiveRef.current = true;
      transitionStartRef.current = Date.now();
      transitionTypeIndexRef.current = (transitionTypeIndexRef.current + 1) % TRANSITION_ORDER.length;
      glitchSeedRef.current = 0;
    }, SLIDE_DURATION);
  }

  // --- Ripple helpers ---
  function initRippleBuffers(w: number, h: number) {
    const res = 4;
    const sw = Math.floor(w / res);
    const sh = Math.floor(h / res);
    ripWidthRef.current = sw;
    ripHeightRef.current = sh;
    ripBuf1Ref.current = new Float32Array(sw * sh);
    ripBuf2Ref.current = new Float32Array(sw * sh);
  }

  function clearRippleBuffers() {
    ripBuf1Ref.current?.fill(0);
    ripBuf2Ref.current?.fill(0);
    rippleDropIndexRef.current = 0;
    ripCacheKeyRef.current = "";
  }

  function rippleDrop(cx: number, cy: number, radius: number, strength: number) {
    const buf = ripBuf1Ref.current;
    const w = ripWidthRef.current;
    const h = ripHeightRef.current;
    if (!buf) return;
    const res = 4;
    const sx = Math.floor(cx / res);
    const sy = Math.floor(cy / res);
    const sr = Math.floor(radius / res);
    for (let dy = -sr; dy <= sr; dy++) {
      for (let dx = -sr; dx <= sr; dx++) {
        const px = sx + dx;
        const py = sy + dy;
        if (px < 0 || px >= w || py < 0 || py >= h) continue;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > sr) continue;
        buf[py * w + px] += strength * Math.cos((dist / sr) * Math.PI * 0.5);
      }
    }
  }

  function stepRipple() {
    const b1 = ripBuf1Ref.current;
    const b2 = ripBuf2Ref.current;
    const w = ripWidthRef.current;
    const h = ripHeightRef.current;
    if (!b1 || !b2) return;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        b2[i] = (b1[i - 1] + b1[i + 1] + b1[i - w] + b1[i + w]) / 2 - b2[i];
        b2[i] *= 0.985;
      }
    }
    ripBuf1Ref.current = b2;
    ripBuf2Ref.current = b1;
  }

  // =================================================================
  // RIPPLE TRANSITION
  // Tile-based compositing — no per-pixel JS loop. Simulation runs at
  // 4x downscale, displacement applied via drawImage tile shifts.
  // =================================================================

  function ensureRippleOffscreens(
    imgOut: HTMLImageElement,
    imgIn: HTMLImageElement,
    w: number,
    h: number
  ) {
    const key = `${imgOut.src}|${imgIn.src}|${w}|${h}`;
    if (ripCacheKeyRef.current === key) return;
    ripCacheKeyRef.current = key;

    if (!ripOffOutRef.current) ripOffOutRef.current = document.createElement("canvas");
    if (!ripOffInRef.current) ripOffInRef.current = document.createElement("canvas");

    ripOffOutRef.current.width = w;
    ripOffOutRef.current.height = h;
    coverDraw(ripOffOutRef.current.getContext("2d")!, imgOut, w, h);

    ripOffInRef.current.width = w;
    ripOffInRef.current.height = h;
    coverDraw(ripOffInRef.current.getContext("2d")!, imgIn, w, h);
  }

  function drawRippleTransition(
    ctx: CanvasRenderingContext2D,
    imgOut: HTMLImageElement,
    imgIn: HTMLImageElement,
    w: number,
    h: number,
    progress: number
  ) {
    const rw = ripWidthRef.current;
    const rh = ripHeightRef.current;
    const buf = ripBuf1Ref.current;
    const tileSize = 4;

    // Sequential drops at staggered progress points
    const drops = [
      { at: 0.00, x: 0.5,  y: 0.5,  radius: 80, strength: 400 },
      { at: 0.15, x: 0.3,  y: 0.35, radius: 60, strength: 300 },
      { at: 0.30, x: 0.72, y: 0.6,  radius: 60, strength: 300 },
      { at: 0.45, x: 0.45, y: 0.75, radius: 50, strength: 250 },
    ];
    while (
      rippleDropIndexRef.current < drops.length &&
      progress >= drops[rippleDropIndexRef.current].at
    ) {
      const d = drops[rippleDropIndexRef.current];
      rippleDrop(w * d.x, h * d.y, d.radius, d.strength);
      rippleDropIndexRef.current++;
    }

    // 6 steps per frame — waves propagate faster
    for (let s = 0; s < 6; s++) stepRipple();

    // Cache cover-drawn images once per transition pair
    ensureRippleOffscreens(imgOut, imgIn, w, h);
    const offOut = ripOffOutRef.current!;
    const offIn = ripOffInRef.current!;

    const blend = ease(progress);

    if (!buf || rw === 0) {
      ctx.globalAlpha = 1 - blend;
      ctx.drawImage(offOut, 0, 0);
      ctx.globalAlpha = blend;
      ctx.drawImage(offIn, 0, 0);
      ctx.globalAlpha = 1;
      return;
    }

    // Base: outgoing image
    ctx.globalAlpha = 1;
    ctx.drawImage(offOut, 0, 0);

    // Crossfade layer: incoming at global blend level
    ctx.globalAlpha = blend;
    ctx.drawImage(offIn, 0, 0);
    ctx.globalAlpha = 1;

    // Displacement tiles: where the water is disturbed, draw displaced
    // tiles from both images with displacement-boosted blend
    const dispScale = 12;

    for (let ty = 1; ty < rh - 1; ty++) {
      for (let tx = 1; tx < rw - 1; tx++) {
        const i = ty * rw + tx;
        const dx = buf[i - 1] - buf[i + 1];
        const dy = buf[i - rw] - buf[i + rw];
        const displacement = Math.abs(dx) + Math.abs(dy);

        if (displacement < 1.5) continue;

        const px = tx * tileSize;
        const py = ty * tileSize;

        const dispFactor = Math.min(1, displacement * 0.12);
        const localBlend = Math.min(1, blend + dispFactor * 0.6);

        const shiftX = Math.round(dx * dispScale);
        const shiftY = Math.round(dy * dispScale);

        // Displaced outgoing tile
        const outSx = Math.max(0, Math.min(w - tileSize, px + shiftX));
        const outSy = Math.max(0, Math.min(h - tileSize, py + shiftY));
        ctx.globalAlpha = 1 - localBlend;
        ctx.drawImage(offOut, outSx, outSy, tileSize, tileSize, px, py, tileSize, tileSize);

        // Displaced incoming tile
        const inShiftScale = dispScale * (1 - blend);
        const inSx = Math.max(0, Math.min(w - tileSize, px - Math.round(dx * inShiftScale)));
        const inSy = Math.max(0, Math.min(h - tileSize, py - Math.round(dy * inShiftScale)));
        ctx.globalAlpha = localBlend;
        ctx.drawImage(offIn, inSx, inSy, tileSize, tileSize, px, py, tileSize, tileSize);
      }
    }

    ctx.globalAlpha = 1;
  }

  // =================================================================
  // GLITCH TRANSITION
  // The outgoing image glitches apart, progressively replaced by the
  // incoming image through the corrupted blocks and scanline shifts.
  // =================================================================
  function drawGlitchTransition(
    ctx: CanvasRenderingContext2D,
    imgOut: HTMLImageElement,
    imgIn: HTMLImageElement,
    w: number,
    h: number,
    progress: number
  ) {
    glitchSeedRef.current += 1;
    const seed = glitchSeedRef.current;

    // Intensity bell curve — peaks at 0.45 then ramps down
    const intensity = progress < 0.45
      ? (progress / 0.45)
      : Math.max(0, 1 - (progress - 0.45) / 0.55);

    // Get pixels for both images
    const outData = getPixels(imgOut, w, h);
    const inData = getPixels(imgIn, w, h);

    // Blend factor for how much incoming image is present
    const blend = ease(progress);

    // Start with pixel-level mix of both images
    const imageData = ctx.createImageData(w, h);
    const pixels = imageData.data;

    // Base layer: blend between out and in
    for (let i = 0; i < pixels.length; i += 4) {
      const inv = 1 - blend;
      pixels[i]     = outData[i]     * inv + inData[i]     * blend;
      pixels[i + 1] = outData[i + 1] * inv + inData[i + 1] * blend;
      pixels[i + 2] = outData[i + 2] * inv + inData[i + 2] * blend;
      pixels[i + 3] = 255;
    }

    if (intensity < 0.01) {
      ctx.putImageData(imageData, 0, 0);
      return;
    }

    const src = new Uint8ClampedArray(pixels);

    // --- Scanline displacement ---
    const bandHeight = 2 + Math.floor(hash(seed * 0.1) * 8);
    for (let y = 0; y < h; y++) {
      const bandIndex = Math.floor(y / bandHeight);
      const rowNoise = hash(bandIndex + seed * 13.7) * 2 - 1;
      let shift = Math.round(rowNoise * 35 * intensity);
      if (hash(bandIndex + seed * 47.3) > 0.9) {
        shift += Math.round(rowNoise * 120 * intensity);
      }
      if (shift === 0) continue;
      for (let x = 0; x < w; x++) {
        const srcX = Math.max(0, Math.min(w - 1, x + shift));
        const di = (y * w + x) * 4;
        const si = (y * w + srcX) * 4;
        pixels[di]     = src[si];
        pixels[di + 1] = src[si + 1];
        pixels[di + 2] = src[si + 2];
      }
    }

    // --- RGB channel separation ---
    const src2 = new Uint8ClampedArray(pixels);
    const angleR = hash(seed * 3.1) * Math.PI * 2;
    const angleB = hash(seed * 7.3) * Math.PI * 2;
    const amount = Math.round(18 * intensity);

    if (amount >= 1) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const di = (y * w + x) * 4;
          // Red channel — sample from outgoing
          const rxOff = Math.round(Math.cos(angleR) * amount);
          const ryOff = Math.round(Math.sin(angleR) * amount);
          const rsx = Math.max(0, Math.min(w - 1, x + rxOff));
          const rsy = Math.max(0, Math.min(h - 1, y + ryOff));
          pixels[di] = src2[(rsy * w + rsx) * 4];
          // Blue channel — sample from incoming
          const bxOff = Math.round(Math.cos(angleB) * amount);
          const byOff = Math.round(Math.sin(angleB) * amount);
          const bsx = Math.max(0, Math.min(w - 1, x + bxOff));
          const bsy = Math.max(0, Math.min(h - 1, y + byOff));
          pixels[di + 2] = src2[(bsy * w + bsx) * 4 + 2];
        }
      }
    }

    // --- Block corruption: blocks pull from different source images ---
    const blockSize = 10 + Math.floor(hash(seed * 11.3) * 28);
    for (let by = 0; by < h; by += blockSize) {
      for (let bx = 0; bx < w; bx += blockSize) {
        const blockNoise = hash(Math.floor(bx / blockSize) * 100 + Math.floor(by / blockSize) + seed * 31.7);
        if (blockNoise < 0.6 / intensity) continue;

        const shiftX = Math.round((hash(blockNoise * 200 + seed) - 0.5) * 180 * intensity);
        const shiftY = Math.round((hash(blockNoise * 300 + seed) - 0.5) * 80 * intensity);
        // Corrupt blocks pull from incoming image to accelerate the reveal
        const sourceData = blockNoise > 0.5 ? inData : outData;

        for (let y = by; y < Math.min(by + blockSize, h); y++) {
          for (let x = bx; x < Math.min(bx + blockSize, w); x++) {
            const ssx = Math.max(0, Math.min(w - 1, x + shiftX));
            const ssy = Math.max(0, Math.min(h - 1, y + shiftY));
            const di = (y * w + x) * 4;
            const si = (ssy * w + ssx) * 4;
            pixels[di]     = sourceData[si];
            pixels[di + 1] = sourceData[si + 1];
            pixels[di + 2] = sourceData[si + 2];
          }
        }
      }
    }

    // --- Static lines ---
    for (let y = 0; y < h; y++) {
      if (hash(y + seed * 97.1) > 0.993) {
        const lineVal = Math.floor(hash(y + seed * 53.3) * 255);
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          pixels[i] = lineVal;
          pixels[i + 1] = lineVal;
          pixels[i + 2] = lineVal;
        }
      }
    }

    // --- Noise grain ---
    for (let y = 0; y < h; y += 2) {
      for (let x = 0; x < w; x += 2) {
        const grain = (hash(x * 0.1 + y * 0.3 + seed * 0.7) - 0.5) * 30 * intensity;
        const i = (y * w + x) * 4;
        pixels[i]     += grain;
        pixels[i + 1] += grain;
        pixels[i + 2] += grain;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  // =================================================================
  // KALEIDOSCOPE TRANSITION
  // The outgoing image fractures into kaleidoscope segments. As the
  // effect intensifies, the segments resolve into the incoming image.
  // =================================================================
  function drawKaleidoscopeTransition(
    ctx: CanvasRenderingContext2D,
    imgOut: HTMLImageElement,
    imgIn: HTMLImageElement,
    w: number,
    h: number,
    progress: number
  ) {
    const segments = 8;
    const step = (Math.PI * 2) / segments;

    // Kaleidoscope intensity: ramp up first half, ramp down second half
    const kIntensity = progress < 0.5
      ? ease(progress * 2)
      : ease((1 - progress) * 2);

    // Smooth crossfade for the base layer underneath the kaleidoscope
    const blend = ease(progress);
    ctx.globalAlpha = 1;
    coverDraw(ctx, imgOut, w, h);
    ctx.globalAlpha = blend;
    coverDraw(ctx, imgIn, w, h);
    ctx.globalAlpha = 1;

    if (kIntensity < 0.01) return;

    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.sqrt(cx * cx + cy * cy);

    // Animated offset — slow drift
    const time = Date.now() * 0.0008;
    const offsetX = (0.5 + Math.sin(time) * 0.25) * w;
    const offsetY = (0.5 + Math.cos(time * 1.3) * 0.25) * h;
    const scale = 0.35 + kIntensity * 0.15;

    // Kaleidoscope pattern crossfades between both images
    const patCanvas = document.createElement("canvas");
    patCanvas.width = w;
    patCanvas.height = h;
    const pctx = patCanvas.getContext("2d")!;
    coverDraw(pctx, imgOut, w, h);
    pctx.globalAlpha = blend;
    coverDraw(pctx, imgIn, w, h);
    pctx.globalAlpha = 1;
    const pattern = ctx.createPattern(patCanvas, "repeat");
    if (!pattern) return;

    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const octx = off.getContext("2d")!;
    octx.fillStyle = pattern;

    // Rotation adds dynamism during transition
    const rotation = progress * Math.PI * 0.15;

    for (let i = 0; i < segments; i++) {
      octx.save();
      octx.translate(cx, cy);
      octx.rotate(i * step + rotation);
      octx.beginPath();
      octx.moveTo(0, 0);
      octx.arc(0, 0, radius, -step * 0.51, step * 0.51);
      octx.closePath();
      octx.clip();
      octx.rotate(Math.PI / 2);
      octx.scale(scale, scale);
      if (i % 2 === 1) octx.scale(-1, 1);
      octx.translate(-offsetX, -offsetY);
      octx.fill();
      octx.restore();
    }

    ctx.globalAlpha = kIntensity;
    ctx.drawImage(off, 0, 0);
    ctx.globalAlpha = 1;
  }

  // =================================================================
  // MAIN DRAW LOOP
  // =================================================================
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !allLoadedRef.current) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    const w = canvas.width;
    const h = canvas.height;
    if (w === 0 || h === 0) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    const images = imagesRef.current;

    if (transitionActiveRef.current) {
      const elapsed = Date.now() - transitionStartRef.current;
      const progress = Math.min(1, elapsed / TRANSITION_DURATION);
      const effect = TRANSITION_ORDER[transitionTypeIndexRef.current % TRANSITION_ORDER.length];
      const imgOut = images[currentIndexRef.current];
      const imgIn = images[nextIndexRef.current];

      if (effect === "ripple") {
        drawRippleTransition(ctx, imgOut, imgIn, w, h, progress);
      } else if (effect === "glitch") {
        drawGlitchTransition(ctx, imgOut, imgIn, w, h, progress);
      } else {
        drawKaleidoscopeTransition(ctx, imgOut, imgIn, w, h, progress);
      }

      if (progress >= 1) {
        transitionActiveRef.current = false;
        currentIndexRef.current = nextIndexRef.current;
        clearRippleBuffers();
        scheduleNextTransition();
      }
    } else {
      coverDraw(ctx, images[currentIndexRef.current], w, h);
    }

    rafRef.current = requestAnimationFrame(draw);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drawRippleTransition is stable for the canvas lifetime
  }, []);

  // --- Auto-advance: first hold starts on mount, subsequent ones after transitions ---
  useEffect(() => {
    scheduleNextTransition();
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);

  // --- Setup ---
  useEffect(() => {
    const images: HTMLImageElement[] = [];
    let loaded = 0;

    SLIDES.forEach((slide, i) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = slide.src;
      img.onload = () => {
        loaded++;
        if (loaded === SLIDES.length) {
          allLoadedRef.current = true;
        }
      };
      images[i] = img;
    });
    imagesRef.current = images;

    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initRippleBuffers(canvas.width, canvas.height);
    };

    window.addEventListener("resize", resize);
    resize();
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  return (
    <div className="preview-slideshow">
      <canvas
        ref={canvasRef}
        className="preview-slideshow__canvas"
      />
      <div className="preview-slideshow__vignette" aria-hidden="true" />
    </div>
  );
}
