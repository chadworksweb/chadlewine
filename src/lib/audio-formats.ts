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

// Every format is named by its extension.
export function downloadFormatLabel(format: string): string {
  return format.toUpperCase();
}

// The qualifier that rides under a format on any surface where the buyer picks
// one. AAC is the pack that imports into iTunes cleanly, artwork and track
// order intact, and nothing else about the file name says so.
export function downloadFormatNote(format: string): string | null {
  return format === "aac" ? "best for iTunes" : null;
}
