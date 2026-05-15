"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

type Props = {
  children: ReactNode;
  /** rem values, largest first. Picks the largest that fits on one line in the cell;
   *  if none fit, uses the smallest and allows a balanced 2-line wrap. */
  sizesRem?: number[];
  /** Selector for the budget element (its content-area width is the fit target).
   *  Defaults to the nearest info-cell. */
  cellSelector?: string;
};

export function FitText({
  children,
  sizesRem = [1.275, 1.15, 1.05, 0.95],
  cellSelector = ".track-detail__info-cell, .product-detail__info-cell",
}: Props) {
  const wrapRef = useRef<HTMLSpanElement>(null);

  useIsoLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const cell = wrap.closest(cellSelector) as HTMLElement | null;
    if (!cell) return;

    const fit = () => {
      const cs = getComputedStyle(cell);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const avail = cell.clientWidth - padX;
      if (avail <= 0) return;

      wrap.style.whiteSpace = "nowrap";
      wrap.style.lineHeight = "";
      (wrap.style as CSSStyleDeclaration & { textWrap: string }).textWrap = "";

      let fits = false;
      for (const sz of sizesRem) {
        wrap.style.fontSize = `${sz}rem`;
        if (wrap.scrollWidth <= avail) {
          fits = true;
          break;
        }
      }

      if (!fits) {
        wrap.style.fontSize = `${sizesRem[sizesRem.length - 1]}rem`;
        wrap.style.whiteSpace = "normal";
        wrap.style.lineHeight = "1.15";
        (wrap.style as CSSStyleDeclaration & { textWrap: string }).textWrap =
          "balance";
      }
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(cell);
    return () => ro.disconnect();
  });

  return (
    <span ref={wrapRef} style={{ display: "inline-block" }}>
      {children}
    </span>
  );
}
