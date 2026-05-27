"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Clickable inline tooltip. Visual language echoes the homepage song-brief
 * "Explore song" cursor chip (cyan, mono), but it toggles on click and
 * persists so multi-line content stays readable. Click-away or Esc closes.
 */
export function PartnershipTooltip({
  children,
  label,
}: {
  children: React.ReactNode;
  label: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span className="sw-partner-tip" ref={ref}>
      <button
        type="button"
        className="sw-partner-tip__trigger"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {children}
        <sup>*</sup>
      </button>
      {open && (
        <span className="sw-partner-tip__bubble" role="tooltip">
          {label}
        </span>
      )}
    </span>
  );
}
