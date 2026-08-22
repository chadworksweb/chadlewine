import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";

/* Inquiry attachments live on the instance's own disk (a mounted volume in
   Docker), not in a storage service. Supabase's bucket went away with the
   2026-08-21 migration to DO Postgres, and these files are private business
   documents, not CDN media, so the Bunny zones are the wrong home too.

   Access is by HMAC-signed URL, same shape as bunny-token signing: the
   notification email and the admin page both link through
   /api/inquiry-file/<path>?expires=...&token=... so a link works without a
   login until it expires. */

const SECRET_ENV = "INQUIRY_FILES_SECRET";

function baseDir(): string {
  // Relative fallback resolves against process.cwd() at runtime. Kept as a
  // plain string (no path.join(process.cwd(), ...)) so Turbopack's file
  // tracer doesn't root the trace at the project directory and pull the
  // whole repo into the standalone output.
  return process.env.INQUIRY_FILES_DIR || "data/inquiry-files";
}

function secret(): string {
  const s = process.env[SECRET_ENV];
  if (!s) throw new Error(`${SECRET_ENV} is not set`);
  return s;
}

/* Paths are always "<uuid>/<n>-<sanitized name>"; reject anything that could
   escape the base directory. */
export function safeRelPath(relPath: string): string | null {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!/^[a-zA-Z0-9._/-]+$/.test(normalized)) return null;
  if (normalized.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) return null;
  return normalized;
}

export async function saveInquiryFile(relPath: string, buf: Buffer): Promise<void> {
  const rel = safeRelPath(relPath);
  if (!rel) throw new Error(`unsafe inquiry file path: ${relPath}`);
  const abs = path.join(/*turbopackIgnore: true*/ baseDir(), rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buf, { flag: "wx" });
}

export async function readInquiryFile(relPath: string): Promise<Buffer | null> {
  const rel = safeRelPath(relPath);
  if (!rel) return null;
  try {
    return await readFile(path.join(/*turbopackIgnore: true*/ baseDir(), rel));
  } catch {
    return null;
  }
}

function tokenFor(rel: string, expires: number): string {
  return createHmac("sha256", secret())
    .update(`${rel}\n${expires}`)
    .digest("base64url");
}

export function signInquiryFileUrl(relPath: string, ttlSec: number): string | null {
  const rel = safeRelPath(relPath);
  if (!rel) return null;
  const expires = Math.floor(Date.now() / 1000) + ttlSec;
  const token = tokenFor(rel, expires);
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
  const encoded = rel.split("/").map(encodeURIComponent).join("/");
  return `${base}/api/inquiry-file/${encoded}?expires=${expires}&token=${token}`;
}

export function verifyInquiryFileToken(relPath: string, expires: number, token: string): boolean {
  const rel = safeRelPath(relPath);
  if (!rel) return false;
  if (!Number.isFinite(expires) || expires < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(tokenFor(rel, expires));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/* Content types the inquiry form accepts; anything else downloads as a blob. */
const EXT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  flac: "audio/flac",
  ogg: "audio/ogg",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

export function inquiryFileContentType(relPath: string): string {
  const ext = relPath.split(".").pop()?.toLowerCase() || "";
  return EXT_TYPES[ext] || "application/octet-stream";
}
