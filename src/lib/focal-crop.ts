import type { CSSProperties } from "react";

export function focalCropStyle(
  focalX: number | null | undefined,
  focalY: number | null | undefined,
  zoom: number | null | undefined
): CSSProperties {
  const fx = focalX ?? 50;
  const fy = focalY ?? 50;
  const z = zoom && zoom > 1 ? zoom : 1;
  const base: CSSProperties = { objectPosition: `${fx}% ${fy}%` };
  if (z !== 1) {
    base.transform = `scale(${z})`;
    base.transformOrigin = `${fx}% ${fy}%`;
  }
  return base;
}
