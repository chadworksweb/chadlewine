"use client";

import { useState, useCallback, useRef } from "react";

interface CursorTooltipProps {
  label: string;
  ripple?: boolean;
  children: React.ReactNode;
}

interface Ripple {
  id: number;
  x: number;
  y: number;
}

let rippleId = 0;

export function CursorTooltip({ label, ripple = false, children }: CursorTooltipProps) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [visible, setVisible] = useState(false);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastRippleTime = useRef(0);

  const handleMove = useCallback((e: React.MouseEvent) => {
    setPos({ x: e.clientX, y: e.clientY });

    if (ripple && containerRef.current) {
      const now = Date.now();
      if (now - lastRippleTime.current > 120) {
        lastRippleTime.current = now;
        const rect = containerRef.current.getBoundingClientRect();
        const r: Ripple = {
          id: ++rippleId,
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
        setRipples((prev) => [...prev.slice(-8), r]);
        setTimeout(() => {
          setRipples((prev) => prev.filter((p) => p.id !== r.id));
        }, 1000);
      }
    }
  }, [ripple]);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMove}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => { setVisible(false); setRipples([]); }}
      style={{ display: "contents" }}
    >
      {children}
      {visible && (
        <div
          className="cursor-tooltip"
          style={{
            position: "fixed",
            left: pos.x + 14,
            top: pos.y + 14,
          }}
        >
          {label}
        </div>
      )}
      {ripples.map((r) => (
        <div
          key={r.id}
          className="cursor-ripple"
          style={{
            position: "absolute",
            left: r.x,
            top: r.y,
          }}
        />
      ))}
    </div>
  );
}
