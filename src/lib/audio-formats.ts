// The download pack formats, in one place. Adding a fifth format means adding
// it here, adding a download_path_{format} column to release_skus + song_skus,
// and widening the purchases.format CHECK. Nothing else hardcodes the list.
//
// Zero dependencies on purpose: server routes, the email builder, and client
// components all import this.

export const DOWNLOAD_FORMATS = ["mp3", "flac", "wav", "aac"] as const;

export type DownloadFormat = (typeof DOWNLOAD_FORMATS)[number];

export function isDownloadFormat(v: unknown): v is DownloadFormat {
  return (
    typeof v === "string" &&
    (DOWNLOAD_FORMATS as readonly string[]).includes(v)
  );
}

// AAC is the pack that drags straight into iTunes, so its button says so.
// Every other format is named by its extension.
export function downloadFormatLabel(format: string): string {
  return format === "aac" ? "AAC for iTunes" : format.toUpperCase();
}

// Tight version for chip-sized buttons in the account dashboard and the
// recovery list, where the full label does not fit.
export function downloadFormatChip(format: string): string {
  return format === "aac" ? "AAC (iTunes)" : format.toUpperCase();
}
