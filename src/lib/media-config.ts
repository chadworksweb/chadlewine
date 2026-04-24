import "server-only";

export type MediaType =
  | "site-image"
  | "cover-art"
  | "music-streaming"
  | "music-download"
  | "art-fullres";

export type MediaTypeConfig = {
  storageZone: string;
  storagePassword: string;
  pullZoneUrl: string;
  tokenAuth: boolean;
  tokenKey?: string;
  allowedMimeTypes: readonly string[];
  label: string;
};

const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

const PRINT_IMAGE_MIME_TYPES = [
  ...IMAGE_MIME_TYPES,
  "image/tiff",
  "application/pdf",
] as const;

const AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/flac",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
] as const;

export const STORAGE_HOSTNAME =
  process.env.BUNNY_STORAGE_HOSTNAME ?? "ny.storage.bunnycdn.com";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const MEDIA_TYPE_CONFIG: Record<MediaType, MediaTypeConfig> = {
  "site-image": {
    storageZone: env("BUNNY_STORAGE_ZONE_SITE_IMAGES"),
    storagePassword: env("BUNNY_STORAGE_ZONE_SITE_IMAGES_PASSWORD"),
    pullZoneUrl: env("NEXT_PUBLIC_BUNNY_PULL_ZONE_SITE_IMAGES"),
    tokenAuth: false,
    allowedMimeTypes: IMAGE_MIME_TYPES,
    label: "Site image",
  },
  "cover-art": {
    storageZone: env("BUNNY_STORAGE_ZONE_COVER_ART"),
    storagePassword: env("BUNNY_STORAGE_ZONE_COVER_ART_PASSWORD"),
    pullZoneUrl: env("NEXT_PUBLIC_BUNNY_PULL_ZONE_COVER_ART"),
    tokenAuth: false,
    allowedMimeTypes: IMAGE_MIME_TYPES,
    label: "Cover art",
  },
  "music-streaming": {
    storageZone: env("BUNNY_STORAGE_ZONE_MUSIC_STREAMING"),
    storagePassword: env("BUNNY_STORAGE_ZONE_MUSIC_STREAMING_PASSWORD"),
    pullZoneUrl: env("NEXT_PUBLIC_BUNNY_PULL_ZONE_MUSIC_STREAMING"),
    tokenAuth: false,
    allowedMimeTypes: AUDIO_MIME_TYPES,
    label: "Music streaming",
  },
  "music-download": {
    storageZone: env("BUNNY_STORAGE_ZONE_MUSIC_DOWNLOADS"),
    storagePassword: env("BUNNY_STORAGE_ZONE_MUSIC_DOWNLOADS_PASSWORD"),
    pullZoneUrl: env("BUNNY_PULL_ZONE_MUSIC_DOWNLOADS"),
    tokenAuth: true,
    tokenKey: env("BUNNY_TOKEN_KEY_MUSIC_DOWNLOADS"),
    allowedMimeTypes: AUDIO_MIME_TYPES,
    label: "Music download",
  },
  "art-fullres": {
    storageZone: env("BUNNY_STORAGE_ZONE_ART"),
    storagePassword: env("BUNNY_STORAGE_ZONE_ART_PASSWORD"),
    pullZoneUrl: env("BUNNY_PULL_ZONE_ART"),
    tokenAuth: true,
    tokenKey: env("BUNNY_TOKEN_KEY_ART"),
    allowedMimeTypes: PRINT_IMAGE_MIME_TYPES,
    label: "Art full-res",
  },
};

export function getMediaConfig(type: MediaType): MediaTypeConfig {
  return MEDIA_TYPE_CONFIG[type];
}

export function isMediaType(value: unknown): value is MediaType {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(MEDIA_TYPE_CONFIG, value)
  );
}
