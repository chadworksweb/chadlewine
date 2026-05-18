"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MerchRippleCanvas, type MerchRippleCanvasHandle } from "./MerchRippleCanvas";

export type ExploreKind = "song" | "release" | "merch" | "art" | "observation";

export interface ExploreGridItem {
  key: string;
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  image_alt: string | null;
  href: string;
  kind?: ExploreKind;
}

interface Props {
  items: ExploreGridItem[];
}

// Cursor-trail tuning copied from DiscographyCubeRadiant. Smaller GLOW_DAMPING
// = more lag; smaller DROP_GAP_PX = denser wake of drops.
const GLOW_DAMPING = 0.07;
const DROP_GAP_PX = 10;
// How long a card keeps its water canvas mounted after the last drop. Needs
// to outlast MerchRippleCanvas's LIFETIME_S so a ring's full animation plays
// out even if the cursor leaves the card immediately after dropping it.
const SETTLE_MS = 3800;

export function ExploreGrid({ items }: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  // Refs target the image-link element (just the image area), NOT the outer
  // card. The outer card includes the title text below the image, so using
  // its height for the cursor->drop projection puts the drop above the cursor.
  const cardRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const waterRefs = useRef<(MerchRippleCanvasHandle | null)[]>([]);

  // Set of card indexes that should currently have a water canvas mounted.
  // Toggled on cursor entry and removed after SETTLE_MS without further hits.
  const [activeIdxs, setActiveIdxs] = useState<Set<number>>(new Set());
  // Index of the card directly under the cursor right now (or null). Drives
  // the hover brightness boost.
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const settleTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const glowTargetRef = useRef<{ x: number; y: number } | null>(null);
  const glowCurrentRef = useRef<{ x: number; y: number } | null>(null);
  const glowFrameRef = useRef<number | null>(null);
  const lastDropAtRef = useRef<{ x: number; y: number } | null>(null);

  const activate = useCallback((idx: number) => {
    const existing = settleTimers.current.get(idx);
    if (existing) clearTimeout(existing);
    settleTimers.current.set(
      idx,
      setTimeout(() => {
        setActiveIdxs((prev) => {
          if (!prev.has(idx)) return prev;
          const next = new Set(prev);
          next.delete(idx);
          return next;
        });
        settleTimers.current.delete(idx);
      }, SETTLE_MS),
    );
    setActiveIdxs((prev) => {
      if (prev.has(idx)) return prev;
      const next = new Set(prev);
      next.add(idx);
      return next;
    });
  }, []);

  const dropOnCards = useCallback((cx: number, cy: number) => {
    let nowOver: number | null = null;
    cardRefs.current.forEach((card, idx) => {
      if (!card) return;
      const rect = card.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) return;
      const fx = ((cx - rect.left) / rect.width) * 100;
      const fy = ((cy - rect.top) / rect.height) * 100;
      if (fx < 0 || fx > 100 || fy < 0 || fy > 100) return;
      nowOver = idx;
      activate(idx);
      const handle = waterRefs.current[idx];
      if (handle) handle.drop(fx, fy, 0.22);
    });
    setHoveredIdx(nowOver);
  }, [activate]);

  const tickGlow = useCallback(() => {
    const t = glowTargetRef.current;
    const c = glowCurrentRef.current;
    if (!t || !c) {
      glowFrameRef.current = null;
      return;
    }
    const nx = c.x + (t.x - c.x) * GLOW_DAMPING;
    const ny = c.y + (t.y - c.y) * GLOW_DAMPING;
    glowCurrentRef.current = { x: nx, y: ny };

    const last = lastDropAtRef.current;
    if (!last) {
      lastDropAtRef.current = { x: nx, y: ny };
    } else {
      const dx = nx - last.x;
      const dy = ny - last.y;
      if (Math.hypot(dx, dy) > DROP_GAP_PX) {
        dropOnCards(nx, ny);
        lastDropAtRef.current = { x: nx, y: ny };
      }
    }

    if (Math.abs(t.x - nx) > 0.3 || Math.abs(t.y - ny) > 0.3) {
      glowFrameRef.current = requestAnimationFrame(tickGlow);
    } else {
      glowFrameRef.current = null;
    }
  }, [dropOnCards]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      glowTargetRef.current = { x: e.clientX, y: e.clientY };
      if (glowCurrentRef.current === null) {
        glowCurrentRef.current = { x: e.clientX, y: e.clientY };
      }
      if (glowFrameRef.current == null) {
        glowFrameRef.current = requestAnimationFrame(tickGlow);
      }
    };
    const onLeave = () => setHoveredIdx(null);
    grid.addEventListener("pointermove", onMove);
    grid.addEventListener("pointerleave", onLeave);
    const timersAtMount = settleTimers.current;
    return () => {
      grid.removeEventListener("pointermove", onMove);
      grid.removeEventListener("pointerleave", onLeave);
      if (glowFrameRef.current != null) {
        cancelAnimationFrame(glowFrameRef.current);
        glowFrameRef.current = null;
      }
      for (const t of timersAtMount.values()) clearTimeout(t);
      timersAtMount.clear();
    };
  }, [tickGlow]);

  if (items.length === 0) return null;

  return (
    <div ref={gridRef} className="explore-strip__grid">
      {items.map((item, idx) => {
        const active = activeIdxs.has(idx);
        const hovered = hoveredIdx === idx;
        const kind = item.kind ?? (item.key.split(":")[0] as ExploreKind | undefined);
        return (
          <div
            key={item.key}
            className={`merch-shop__card${hovered ? " merch-shop__card--hovered" : ""}`}
          >
            {item.image_url && (
              <Link
                href={item.href}
                ref={(el) => { cardRefs.current[idx] = el; }}
                className="merch-shop__card-img-link merch-shop__card-img-link--water"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.image_url}
                  alt={item.image_alt || item.title}
                  className="merch-shop__card-img"
                />
                {active && (
                  <MerchRippleCanvas
                    ref={(handle) => { waterRefs.current[idx] = handle; }}
                    src={item.image_url}
                    className="merch-shop__card-water"
                  />
                )}
              </Link>
            )}
            <h3 className="merch-shop__card-title">
              <Link href={item.href} className="merch-shop__card-title-link">
                {item.title}
              </Link>
              {kind && (
                <span className={`hero-lens__kind hero-lens__kind--${kind} merch-shop__card-kind`}>
                  {kind}
                </span>
              )}
            </h3>
          </div>
        );
      })}
    </div>
  );
}
