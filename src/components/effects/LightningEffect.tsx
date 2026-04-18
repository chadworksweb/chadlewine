"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { getCoverCropRect } from "@/lib/coverCrop";

interface LightningEffectProps {
  src: string;
  alt: string;
  className?: string;
  focalX?: number;
  focalY?: number;
}

function generateBoltPath(
  x1: number, y1: number, x2: number, y2: number, segments = 12
): [number, number][] {
  const points: [number, number][] = [[x1, y1]];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const px = -dy / len;
  const py = dx / len;

  for (let i = 1; i < segments; i++) {
    const t = i / segments;
    const baseX = x1 + dx * t;
    const baseY = y1 + dy * t;
    const jag = (Math.random() - 0.5) * len * 0.15 * Math.sin(t * Math.PI);
    points.push([baseX + px * jag, baseY + py * jag]);
  }
  points.push([x2, y2]);
  return points;
}

function pointsToPath(points: [number, number][]): string {
  return "M " + points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ");
}

function randomEdgePoint(w: number, h: number) {
  const perim = 2 * (w + h);
  let p = Math.random() * perim;
  if (p < w) return { x: p, y: 0 };
  p -= w;
  if (p < h) return { x: w, y: p };
  p -= h;
  if (p < w) return { x: w - p, y: h };
  p -= w;
  return { x: 0, y: h - p };
}

function generateStrike(w: number, h: number) {
  const start = randomEdgePoint(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const end = {
    x: Math.max(0, Math.min(w, cx + (cx - start.x) + (Math.random() - 0.5) * cx * 0.6)),
    y: Math.max(0, Math.min(h, cy + (cy - start.y) + (Math.random() - 0.5) * cy * 0.6)),
  };

  const mainPoints = generateBoltPath(start.x, start.y, end.x, end.y, 14);
  const mainPath = pointsToPath(mainPoints);

  const branches: string[] = [];
  const branchCount = 2 + Math.floor(Math.random() * 2);
  for (let b = 0; b < branchCount; b++) {
    const idx = 3 + Math.floor(Math.random() * (mainPoints.length - 6));
    const [bx, by] = mainPoints[idx];
    const branchLen = 40 + Math.random() * 80;
    const angle = Math.random() * Math.PI * 2;
    const branchPoints = generateBoltPath(bx, by, bx + Math.cos(angle) * branchLen, by + Math.sin(angle) * branchLen, 4);
    branches.push(pointsToPath(branchPoints));
  }

  // Random thickness: 0 = hairline, 1 = massive
  const thickness = Math.random();
  return { mainPath, branches, thickness };
}

export function LightningEffect({ src, alt, className, focalX = 0.5, focalY = 0.5 }: LightningEffectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [striking, setStriking] = useState(false);
  const focalRef = useRef({ x: focalX, y: focalY });
  focalRef.current = { x: focalX, y: focalY };

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    imgRef.current = img;

    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const container = containerRef.current;
      if (!canvas || !ctx || !container || !img.complete) {
        requestAnimationFrame(draw);
        return;
      }
      canvas.width = container.offsetWidth;
      canvas.height = container.offsetHeight;
      const crop = getCoverCropRect(img.naturalWidth, img.naturalHeight, canvas.width / canvas.height, focalRef.current.x, focalRef.current.y);
      ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
    };

    img.onload = draw;

    const handleResize = () => draw();
    window.addEventListener("resize", handleResize);
    draw();

    return () => window.removeEventListener("resize", handleResize);
  }, [src]);

  const strike = useCallback(() => {
    if (striking || !containerRef.current || !svgRef.current) return;
    setStriking(true);

    const rect = containerRef.current.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const data = generateStrike(w, h);
    const svg = svgRef.current;

    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.innerHTML = "";

    const ns = "http://www.w3.org/2000/svg";
    const t = data.thickness * data.thickness; // exponential curve — more variety at the thick end
    const glowW = 4 + t * 80;    // 4–84
    const mainW = 1 + t * 20;    // 1–21
    const coreW = 0.5 + t * 8;   // 0.5–8.5

    // Glow
    const glow = document.createElementNS(ns, "path");
    glow.setAttribute("d", data.mainPath);
    glow.setAttribute("fill", "none");
    glow.setAttribute("stroke", "rgba(180,200,255,0.4)");
    glow.setAttribute("stroke-width", String(glowW));
    glow.setAttribute("stroke-linecap", "round");
    glow.setAttribute("stroke-linejoin", "round");
    glow.style.animation = "glow-pulse 0.3s ease-out 0.15s both";
    svg.appendChild(glow);

    // Main bolt
    const main = document.createElementNS(ns, "path");
    main.setAttribute("d", data.mainPath);
    main.setAttribute("fill", "none");
    main.setAttribute("stroke", "#fff");
    main.setAttribute("stroke-width", String(mainW));
    main.setAttribute("stroke-linecap", "round");
    main.setAttribute("stroke-linejoin", "round");
    svg.appendChild(main);

    // Core
    const core = document.createElementNS(ns, "path");
    core.setAttribute("d", data.mainPath);
    core.setAttribute("fill", "none");
    core.setAttribute("stroke", "rgba(200,220,255,0.9)");
    core.setAttribute("stroke-width", String(coreW));
    core.setAttribute("stroke-linecap", "round");
    core.setAttribute("stroke-linejoin", "round");
    svg.appendChild(core);

    // Branches
    const branchEls: SVGPathElement[] = [];
    for (const bp of data.branches) {
      const branch = document.createElementNS(ns, "path");
      branch.setAttribute("d", bp);
      branch.setAttribute("fill", "none");
      branch.setAttribute("stroke", "rgba(200,210,255,0.7)");
      branch.setAttribute("stroke-width", "2");
      branch.setAttribute("stroke-linecap", "round");
      branch.setAttribute("stroke-linejoin", "round");
      svg.appendChild(branch);
      branchEls.push(branch);
    }

    // Animate main bolt
    const mainLen = main.getTotalLength();
    main.style.strokeDasharray = String(mainLen);
    main.style.strokeDashoffset = String(mainLen);
    main.getBoundingClientRect();
    main.style.transition = "stroke-dashoffset 0.15s linear";
    main.style.strokeDashoffset = "0";

    // Animate branches
    branchEls.forEach((el, j) => {
      const bLen = el.getTotalLength();
      el.style.strokeDasharray = String(bLen);
      el.style.strokeDashoffset = String(bLen);
      el.getBoundingClientRect();
      el.style.transition = `stroke-dashoffset 0.1s linear ${0.08 + j * 0.04}s`;
      el.style.strokeDashoffset = "0";
    });

    // Strobe flash on the art container
    containerRef.current.style.animation = "lightning-strobe 0.9s linear forwards";

    // Decay — fade the bolt out slowly
    setTimeout(() => {
      svg.style.transition = "opacity 1.2s ease-out";
      svg.style.opacity = "0";
    }, 400);

    // Cleanup after decay completes
    setTimeout(() => {
      svg.innerHTML = "";
      svg.style.transition = "";
      svg.style.opacity = "1";
      if (containerRef.current) {
        containerRef.current.style.animation = "";
      }
      setStriking(false);
    }, 1800);
  }, [striking]);

  // Click to strike
  const handleClick = useCallback(() => {
    strike();
  }, [strike]);

  return (
    <div
      ref={containerRef}
      className={className}
      onClick={handleClick}
      style={{ position: "relative", overflow: "hidden", cursor: "pointer" }}
    >
      <img src={src} alt={alt} style={{ width: "100%", display: "block", visibility: "hidden" }} />
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      />
      <svg
        ref={svgRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 5,
        }}
      />
    </div>
  );
}
