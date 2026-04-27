// Shared helper for ratio-crop rendering. Given a source image and a target
// aspect ratio, returns the source rectangle that, when drawn into the target,
// produces a cover-crop that matches CSS `object-fit: cover` + `object-position`
// semantics (focal X/Y distribute the cropped-away excess proportionally).
//
// This keeps canvas/WebGL consumers (hero effects) in sync with the admin
// preview thumb and CSS-based consumers (mobile hero, card grids), which use
// the same math via `focalCropStyle`.
//
// focalX, focalY are 0-1 normalized against the source. 0.5/0.5 = center.
// zoom >= 1 shrinks the crop rect around the focal point (tighter view).

export function getCoverCropRect(
  imgW: number,
  imgH: number,
  targetAspect: number,
  focalX: number,
  focalY: number,
  zoom: number = 1,
): { sx: number; sy: number; sw: number; sh: number } {
  if (!imgW || !imgH || !targetAspect) {
    return { sx: 0, sy: 0, sw: imgW || 0, sh: imgH || 0 };
  }

  const imgAspect = imgW / imgH;
  const fx = Math.max(0, Math.min(1, focalX));
  const fy = Math.max(0, Math.min(1, focalY));
  const z = zoom >= 1 ? zoom : 1;

  // Base cover-crop size (what would render at zoom=1).
  let sw: number;
  let sh: number;
  if (imgAspect > targetAspect) {
    sh = imgH;
    sw = imgH * targetAspect;
  } else {
    sw = imgW;
    sh = imgW / targetAspect;
  }

  // Zoom = shrink the crop rect. z>1 means tighter view (smaller rect).
  sw = sw / z;
  sh = sh / z;

  // Position the rect. CSS object-position semantics: distribute the total
  // excess (imgW - sw, imgH - sh) between the two sides based on focal %.
  // focalX=0 → all excess on the right (keep left edge visible).
  // focalX=1 → all excess on the left (keep right edge visible).
  // focalX=0.5 → centered.
  const sx = Math.max(0, Math.min(imgW - sw, (imgW - sw) * fx));
  const sy = Math.max(0, Math.min(imgH - sh, (imgH - sh) * fy));
  return { sx, sy, sw, sh };
}

export const HERO_ART_ASPECT = 1200 / 630;
