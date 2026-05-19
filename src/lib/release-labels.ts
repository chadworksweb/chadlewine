export type ReleaseType = "album" | "ep" | "single" | "compilation";
export type ReleaseFormat = "digital" | "vinyl" | "cd" | "cassette";
export type SkuStatus = "available" | "preorder" | "sold_out" | "discontinued";

const TYPE_LABEL: Record<string, string> = {
  album: "Album",
  ep: "EP",
  single: "Single",
  compilation: "Compilation",
};

const FORMAT_LABEL: Record<string, string> = {
  digital: "Digital",
  vinyl: "Vinyl",
  cd: "CD",
  cassette: "Cassette",
};

const SKU_STATUS_LABEL: Record<string, string> = {
  available: "Available",
  preorder: "Pre-order",
  sold_out: "Sold out",
  discontinued: "Discontinued",
};

export function releaseTypeLabel(t: string | null | undefined): string {
  if (!t) return "";
  return TYPE_LABEL[t] ?? t;
}

export function releaseFormatLabel(f: string | null | undefined): string {
  if (!f) return "";
  return FORMAT_LABEL[f] ?? f;
}

export function skuStatusLabel(s: string | null | undefined): string {
  if (!s) return "";
  return SKU_STATUS_LABEL[s] ?? s;
}

export function formatReleaseLabel(
  type: string | null | undefined,
  format: string | null | undefined,
): string {
  const typeText = releaseTypeLabel(type);
  const formatText = releaseFormatLabel(format);
  if (typeText && formatText) return `${formatText} ${typeText}`;
  return typeText || formatText || "";
}

export const RELEASE_TYPE_OPTIONS: { value: ReleaseType; label: string }[] = [
  { value: "album", label: "Album" },
  { value: "ep", label: "EP" },
  { value: "single", label: "Single" },
  { value: "compilation", label: "Compilation" },
];

export const RELEASE_FORMAT_OPTIONS: { value: ReleaseFormat; label: string }[] = [
  { value: "digital", label: "Digital" },
  { value: "vinyl", label: "Vinyl" },
  { value: "cd", label: "CD" },
  { value: "cassette", label: "Cassette" },
];

export const SKU_STATUS_OPTIONS: { value: SkuStatus; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "preorder", label: "Pre-order" },
  { value: "sold_out", label: "Sold out" },
  { value: "discontinued", label: "Discontinued" },
];
