// Shared helper for ratio-crop rendering. Given a source image and a target
// aspect ratio, returns the source rectangle that, when drawn into the target,
// produces a cover-crop that keeps the chosen focal point visible.
//
// focalX, focalY are 0-1 normalized against the source. 0.5/0.5 = center.

export function getCoverCropRect(
  imgW: number,
  imgH: number,
  targetAspect: number,
  focalX: number,
  focalY: number
): { sx: number; sy: number; sw: number; sh: number } {
  if (!imgW || !imgH || !targetAspect) {
    return { sx: 0, sy: 0, sw: imgW || 0, sh: imgH || 0 };
  }

  const imgAspect = imgW / imgH;
  const fx = Math.max(0, Math.min(1, focalX));
  const fy = Math.max(0, Math.min(1, focalY));

  if (imgAspect > targetAspect) {
    // Image is wider than target → crop horizontally, keep full height.
    const sh = imgH;
    const sw = imgH * targetAspect;
    const sx = Math.max(0, Math.min(imgW - sw, fx * imgW - sw / 2));
    return { sx, sy: 0, sw, sh };
  }

  // Image is taller (or equal) → crop vertically, keep full width.
  const sw = imgW;
  const sh = imgW / targetAspect;
  const sy = Math.max(0, Math.min(imgH - sh, fy * imgH - sh / 2));
  return { sx: 0, sy, sw, sh };
}

export const HERO_ART_ASPECT = 1200 / 630;
