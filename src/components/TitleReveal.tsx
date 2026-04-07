"use client";

import { useEffect, useRef, useCallback } from "react";

interface TitleRevealProps {
  artImageUrl: string;
  children: React.ReactNode;
}

interface Trail {
  x: number;
  y: number;
  opacity: number;
  radius: number;
}

export function TitleReveal({ artImageUrl, children }: TitleRevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const trailsRef = useRef<Trail[]>([]);
  const rafRef = useRef<number>(0);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const maskBuiltRef = useRef(false);

  function buildMask(dpr: number) {
    const container = containerRef.current;
    if (!container) return;

    const h1 = container.querySelector("h1");
    if (!h1) return;

    const cw = container.offsetWidth;
    const ch = container.offsetHeight;

    if (!maskRef.current) {
      maskRef.current = document.createElement("canvas");
    }
    const mask = maskRef.current;
    mask.width = cw * dpr;
    mask.height = ch * dpr;

    const mctx = mask.getContext("2d");
    if (!mctx) return;

    mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    mctx.clearRect(0, 0, cw, ch);

    const containerRect = container.getBoundingClientRect();

    function findTextNode(el: Node): Text | null {
      for (const child of Array.from(el.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) return child as Text;
        const found = findTextNode(child);
        if (found) return found;
      }
      return null;
    }

    const textNode = findTextNode(h1);
    if (!textNode) return;

    const style = getComputedStyle(h1);
    const textTransform = style.textTransform;
    const text = textNode.textContent || "";
    const displayText = textTransform === "uppercase" ? text.toUpperCase() : text;

    mctx.font = style.font;
    mctx.fillStyle = "#fff";
    mctx.textBaseline = "top";

    // Scale offset with computed font size so it aligns at every breakpoint.
    // The 26px offset was calibrated at ~88px font size (26/88 ≈ 0.295).
    const fontSize = parseFloat(style.fontSize);
    const offsetX = 0;
    const offsetY = fontSize * 0.295;

    const range = document.createRange();
    for (let i = 0; i < text.length; i++) {
      range.setStart(textNode, i);
      range.setEnd(textNode, i + 1);
      const rects = range.getClientRects();
      if (rects.length === 0) continue;
      const r = rects[0];
      const x = r.left - containerRect.left + offsetX;
      const y = r.top - containerRect.top + offsetY;
      mctx.fillText(displayText[i], x, y);
    }

    maskBuiltRef.current = true;
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const img = imgRef.current;
    if (!canvas || !ctx || !img || !img.complete) {
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;

    if (!maskBuiltRef.current) {
      buildMask(dpr);
    }
    const mask = maskRef.current;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (trailsRef.current.length === 0 || !mask) {
      ctx.restore();
      rafRef.current = requestAnimationFrame(draw);
      return;
    }

    // Step 1: Draw art through comet trail circles
    for (const t of trailsRef.current) {
      ctx.save();
      ctx.globalAlpha = t.opacity;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, 0, 0, w, h);
      ctx.restore();
    }

    // Step 2: Mask to text — only keep art inside letter shapes
    ctx.globalCompositeOperation = "destination-in";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(mask, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";

    ctx.restore();

    // Decay
    trailsRef.current = trailsRef.current
      .map((t) => ({ ...t, opacity: t.opacity - 0.008, radius: t.radius + 0.12 }))
      .filter((t) => t.opacity > 0);

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    if (!artImageUrl) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = artImageUrl;
    imgRef.current = img;

    const resize = () => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = container.offsetWidth * dpr;
      canvas.height = container.offsetHeight * dpr;
      canvas.style.width = container.offsetWidth + "px";
      canvas.style.height = container.offsetHeight + "px";
      maskBuiltRef.current = false;
    };

    img.onload = resize;
    window.addEventListener("resize", resize);
    resize();

    // Rebuild after fonts load
    if (document.fonts) {
      document.fonts.ready.then(() => {
        maskBuiltRef.current = false;
      });
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [artImageUrl, draw]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    // Only paint when cursor is over actual text
    const target = e.target as HTMLElement;
    if (!target.closest("h1") && !target.closest("a")) return;
    const rect = container.getBoundingClientRect();
    trailsRef.current.push({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      opacity: 0.8,
      radius: 47,
    });
  }, []);

  if (!artImageUrl) {
    return <>{children}</>;
  }

  return (
    <div
      ref={containerRef}
      className="title-reveal"
      onMouseMove={handleMouseMove}
    >
      <div className="title-reveal__text">
        {children}
      </div>
      <canvas
        ref={canvasRef}
        className="title-reveal__canvas"
      />
    </div>
  );
}
