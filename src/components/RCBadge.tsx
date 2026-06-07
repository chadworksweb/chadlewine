/** Shared Rising Compass badge — used on track/album detail pages and CL Stream. */

const COLOR_HEX: Record<string, string> = {
  violet: "#9933ff",
  blue: "#3388ff",
  green: "#33cc55",
  orange: "#ffbb33",
  red: "#ff3333",
};

const COLOR_LABEL: Record<string, string> = {
  violet: "Ascended",
  blue: "Elevated",
  green: "Decent",
  orange: "Degraded",
  red: "Corrupted",
};

export function rcTierHex(color: string): string {
  return COLOR_HEX[color] ?? "#888";
}

export function rcTierLabel(color: string): string {
  return COLOR_LABEL[color] ?? color;
}

// The badge mark itself lives in its own canonical, self-contained module --
// RisingCompassMark. Re-exported here as `CompassIcon` so existing call sites
// that import it from this file keep working.
export { RisingCompassMark, CompassIcon } from "@/components/RisingCompassMark";
