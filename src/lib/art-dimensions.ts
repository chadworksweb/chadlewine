// Structured artwork size is the single source of truth. width_in / height_in /
// depth_in drive every surface that shows or scales a piece: the detail-page meta
// row, JSON-LD, the art index cards, and the homepage gallery wall. This formats
// those numerics into one consistent display string, e.g. "16 x 20 in", or
// "16 x 20 x 1 in" when a depth is set.
//
// Returns null when width or height is missing -- both are required to describe a
// face, and callers use the null to hide the dimensions line entirely.
export function formatDimensions(
  width: number | null | undefined,
  height: number | null | undefined,
  depth?: number | null,
): string | null {
  if (width == null || height == null) return null;
  const n = (v: number) => String(Number(v));
  const core =
    depth != null && depth > 0
      ? `${n(width)} x ${n(height)} x ${n(depth)}`
      : `${n(width)} x ${n(height)}`;
  return `${core} in`;
}
