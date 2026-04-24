import "server-only";
import { createHash } from "node:crypto";
import type { MediaTypeConfig } from "./media-config";

const DEFAULT_EXPIRY_SECONDS = 300;

export function signBunnyUrl(
  config: MediaTypeConfig,
  path: string,
  expiresInSec: number = DEFAULT_EXPIRY_SECONDS,
): string {
  if (!config.tokenAuth || !config.tokenKey) {
    throw new Error(
      `signBunnyUrl called for non-token-auth zone: ${config.storageZone}`,
    );
  }

  const normalizedPath = "/" + path.replace(/^\/+/, "");
  const expires = Math.floor(Date.now() / 1000) + expiresInSec;

  const hash = createHash("md5")
    .update(config.tokenKey + normalizedPath + expires)
    .digest("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const base = config.pullZoneUrl.replace(/\/+$/, "");
  return `${base}${normalizedPath}?token=${hash}&expires=${expires}`;
}
