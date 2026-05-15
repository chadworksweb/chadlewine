import { Resend } from "resend";

let _resend: Resend | null = null;

export function getResend(): Resend {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "RESEND_API_KEY is not set. Add it to .env.local before sending email."
    );
  }
  _resend = new Resend(key);
  return _resend;
}

/** Returns the site's canonical origin without trailing slash. Used to build
   absolute URLs (unsubscribe link) inside emails. */
export function siteOrigin(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "https://chadlewine.com";
  return fromEnv.replace(/\/$/, "");
}
