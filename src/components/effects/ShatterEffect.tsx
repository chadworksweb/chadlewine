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

type Point = [number, number];

interface Shard {
  polygon: Point[];
  cx: number;
  cy: number;
  vx: number;
  vy: number;
  rotation: number;
  angularVel: number;
  life: number;
  falling: boolean;
  generation: number;
  crackReveal: number; // 0 = hidden edges, 1 = fully visible
  crackOrigin: Point | null; // where the crack started from
}

function computeVoronoiCells(seeds: Point[], w: number, h: number): Point[][] {
  const scale = 4;
  const sw = Math.ceil(w / scale);
  const sh = Math.ceil(h / scale);
  const grid = new Int16Array(sw * sh);

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const px = x * scale;
      const py = y * scale;
      let minDist = Infinity;
      let minIdx = 0;
      for (let s = 0; s < seeds.length; s++) {
        const dx = px - seeds[s][0];
        const dy = py - seeds[s][1];
        const d = dx * dx + dy * dy;
        if (d < minDist) {
          minDist = d;
          minIdx = s;
        }
      }
      grid[y * sw + x] = minIdx;
    }
  }

  const cellPoints: Map<number, Point[]> = new Map();
  for (let s = 0; s < seeds.length; s++) {
    cellPoints.set(s, []);
  }

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const idx = grid[y * sw + x];
      const px = x * scale;
      const py = y * scale;
      let isBorder = x === 0 || x === sw - 1 || y === 0 || y === sh - 1;
      if (!isBorder) {
        const neighbors = [
          grid[(y - 1) * sw + x], grid[(y + 1) * sw + x],
          grid[y * sw + x - 1], grid[y * sw + x + 1],
        ];
        isBorder = neighbors.some((n) => n !== idx);
      }
      if (isBorder) {
        cellPoints.get(idx)!.push([px, py]);
      }
    }
  }

  const cells: Point[][] = [];
  for (let s = 0; s < seeds.length; s++) {
    const pts = cellPoints.get(s)!;
    if (pts.length < 3) continue;
    cells.push(convexHull(pts));
  }
  return cells;
}

function convexHull(points: Point[]): Point[] {
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (points.length <= 2) return points;
  const lower: Point[] = [];
  for (const p of points) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

function cross(o: Point, a: Point, b: Point): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function centroid(poly: Point[]): Point {
  let cx = 0, cy = 0;
  for (const p of poly) { cx += p[0]; cy += p[1]; }
  return [cx / poly.length, cy / poly.length];
}

function polyArea(poly: Point[]): number {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    area += poly[i][0] * poly[j][1];
    area -= poly[j][0] * poly[i][1];
  }
  return Math.abs(area) / 2;
}

function pointInPoly(px: number, py: number, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// Get bounding box of polygon
function polyBounds(poly: Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
  }
  return { minX, minY, maxX, maxY };
}

// Subdivide a polygon using Voronoi with seeds inside its bounds
function subdivideShard(shard: Shard, clickX: number, clickY: number): Shard[] {
  const bounds = polyBounds(shard.polygon);
  const bw = bounds.maxX - bounds.minX;
  const bh = bounds.maxY - bounds.minY;

  // Generate 3-5 seeds inside this shard, biased toward click
  const seeds: Point[] = [];
  const attempts = 80;
  const targetCount = 3 + Math.floor(Math.random() * 3);

  for (let i = 0; i < attempts && seeds.length < targetCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.pow(Math.random(), 0.6) * Math.max(bw, bh) * 0.6;
    const x = clickX + Math.cos(angle) * dist;
    const y = clickY + Math.sin(angle) * dist;
    if (pointInPoly(x, y, shard.polygon)) {
      seeds.push([x, y]);
    }
  }

  // Fallback: random points inside polygon
  if (seeds.length < 2) {
    for (let i = 0; i < attempts && seeds.length < targetCount; i++) {
      const x = bounds.minX + Math.random() * bw;
      const y = bounds.minY + Math.random() * bh;
      if (pointInPoly(x, y, shard.polygon)) {
        seeds.push([x, y]);
      }
    }
  }

  if (seeds.length < 2) return [shard]; // can't subdivide

  const cells = computeVoronoiCells(seeds, bounds.maxX, bounds.maxY);

  // Clip each cell to the parent polygon (approximate: only keep cells whose centroid is inside parent)
  const newShards: Shard[] = [];
  for (const cell of cells) {
    const [cx, cy] = centroid(cell);
    if (!pointInPoly(cx, cy, shard.polygon)) continue;

    // Clip cell vertices to parent bounds (rough)
    const clipped = cell.filter((p) =>
      p[0] >= bounds.minX - 4 && p[0] <= bounds.maxX + 4 &&
      p[1] >= bounds.minY - 4 && p[1] <= bounds.maxY + 4
    );
    if (clipped.length < 3) continue;

    const hull = convexHull(clipped);
    if (hull.length < 3) continue;

    const area = polyArea(hull);
    if (area < 50) continue; // too small

    newShards.push({
      polygon: hull,
      cx, cy,
      vx: (Math.random() - 0.5) * 1.5,
      vy: -0.5 - Math.random() * 2,
      rotation: 0,
      angularVel: (Math.random() - 0.5) * 0.08,
      life: 1,
      falling: false,
      generation: shard.generation + 1,
      crackReveal: 0,
      crackOrigin: [clickX, clickY],
    });
  }

  return newShards.length >= 2 ? newShards : [shard];
}

export function ShatterEffect({ src, alt, className, focalX = 0.5, focalY = 0.5, zoom = 1 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const focalRef = useRef({ x: focalX, y: focalY, z: zoom });
  const rafRef = useRef<number>(0);
  const shardsRef = useRef<Shard[]>([]);
  const initializedRef = useRef(false);

  useEffect(() => {
    focalRef.current = { x: focalX, y: focalY, z: zoom };
  }, [focalX, focalY, zoom]);

  function initShards(w: number, h: number) {
    // Initial coarse Voronoi — large organic pieces
    const seeds: Point[] = [];
    const count = 14 + Math.floor(Math.random() * 6);
    for (let i = 0; i < count; i++) {
      seeds.push([Math.random() * w, Math.random() * h]);
    }

    const cells = computeVoronoiCells(seeds, w, h);
    shardsRef.current = cells.map((poly) => {
      const [cx, cy] = centroid(poly);
      return {
        polygon: poly, cx, cy,
        vx: 0, vy: 0, rotation: 0, angularVel: 0,
        life: 1, falling: false, generation: 0,
        crackReveal: 1, crackOrigin: null,
      };
    });
    initializedRef.current = true;
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
    const shards = shardsRef.current;

    ctx.clearRect(0, 0, w, h);

    if (!initializedRef.current || shards.length === 0) {
      const crop = getCoverCropRect(img.naturalWidth, img.naturalHeight, w / h, focalRef.current.x, focalRef.current.y, focalRef.current.z);
      ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    for (const s of shards) {
      if (s.life <= 0) continue;

      ctx.save();
      ctx.globalAlpha = s.life;

      if (s.falling) {
        ctx.translate(s.cx, s.cy);
        ctx.translate(s.vx * (1 - s.life) * 80, s.vy * (1 - s.life) * 80);
        ctx.rotate(s.rotation);
        ctx.translate(-s.cx, -s.cy);
      }

      ctx.beginPath();
      ctx.moveTo(s.polygon[0][0], s.polygon[0][1]);
      for (let i = 1; i < s.polygon.length; i++) {
        ctx.lineTo(s.polygon[i][0], s.polygon[i][1]);
      }
      ctx.closePath();
      ctx.clip();
      const crop = getCoverCropRect(img.naturalWidth, img.naturalHeight, w / h, focalRef.current.x, focalRef.current.y, focalRef.current.z);
      ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);

      if (s.generation > 0 && s.crackReveal > 0) {
        // Draw edges with partial reveal — animate from crackOrigin outward
        const alpha = Math.min(0.5, s.generation * 0.15) * Math.min(1, s.crackReveal);
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
        ctx.lineWidth = 0.8;

        if (s.crackReveal >= 1 || !s.crackOrigin) {
          ctx.stroke();
        } else {
          // Draw only the portion of each edge within the reveal radius
          const maxDist = 400;
          const revealRadius = s.crackReveal * maxDist;
          const ox = s.crackOrigin[0];
          const oy = s.crackOrigin[1];

          ctx.beginPath();
          for (let i = 0; i < s.polygon.length; i++) {
            const j = (i + 1) % s.polygon.length;
            const p1 = s.polygon[i];
            const p2 = s.polygon[j];
            const d1 = Math.hypot(p1[0] - ox, p1[1] - oy);
            const d2 = Math.hypot(p2[0] - ox, p2[1] - oy);

            if (d1 <= revealRadius && d2 <= revealRadius) {
              ctx.moveTo(p1[0], p1[1]);
              ctx.lineTo(p2[0], p2[1]);
            } else if (d1 <= revealRadius) {
              const t = (revealRadius - d1) / (d2 - d1);
              const mx = p1[0] + (p2[0] - p1[0]) * Math.min(1, t);
              const my = p1[1] + (p2[1] - p1[1]) * Math.min(1, t);
              ctx.moveTo(p1[0], p1[1]);
              ctx.lineTo(mx, my);
            } else if (d2 <= revealRadius) {
              const t = (revealRadius - d2) / (d1 - d2);
              const mx = p2[0] + (p1[0] - p2[0]) * Math.min(1, t);
              const my = p2[1] + (p1[1] - p2[1]) * Math.min(1, t);
              ctx.moveTo(mx, my);
              ctx.lineTo(p2[0], p2[1]);
            }
          }
          ctx.stroke();
        }
      }

      ctx.restore();

      // Animate crack reveal
      if (s.crackReveal < 1) {
        s.crackReveal += 0.04;
        if (s.crackReveal > 1) s.crackReveal = 1;
      }

      if (s.falling) {
        s.vy += 0.25;
        s.vx *= 0.997;
        s.rotation += s.angularVel;
        s.life -= 0.005;
      }
    }

    // Remove dead shards
    shardsRef.current = shards.filter((s) => s.life > 0);

    // Reset when everything has fallen
    if (shardsRef.current.length === 0 && initializedRef.current) {
      initializedRef.current = false;
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
      shardsRef.current = [];
      initializedRef.current = false;
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
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    if (!initializedRef.current) {
      initShards(canvas.width, canvas.height);
      return;
    }

    // Find shards near click, subdivide them (more cracks)
    // Small pieces near click fall away
    const newShards: Shard[] = [];
    const maxSubdivDist = 200;

    for (const s of shardsRef.current) {
      if (s.life <= 0) {
        newShards.push(s);
        continue;
      }

      const dist = Math.hypot(s.cx - clickX, s.cy - clickY);

      if (dist > maxSubdivDist || !pointInPoly(clickX, clickY, s.polygon) && dist > 100) {
        // Too far — leave intact
        newShards.push(s);
        continue;
      }

      if (s.generation >= 1) {
        // 3rd click in this area — pieces fall
        const angle = Math.atan2(s.cy - clickY, s.cx - clickX);
        newShards.push({
          ...s,
          falling: true,
          vx: Math.cos(angle) * 1.2 + (Math.random() - 0.5),
          vy: -0.5 - Math.random() * 1.5,
          angularVel: (Math.random() - 0.5) * 0.08,
        });
      } else {
        // Subdivide into smaller pieces
        const children = subdivideShard(s, clickX, clickY);
        newShards.push(...children);
      }
    }

    shardsRef.current = newShards;
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
