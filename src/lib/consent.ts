/* Cookie-consent shared logic (anonymous cookie + account-backed).
 *
 * Source of truth at runtime is the `cl_cookie_consent` cookie
 * (essential:1|functional:X|analytics:X|marketing:X), readable on server and
 * client. For signed-in users the choice is also persisted on their audience
 * row and re-seeded into the cookie on login (see ConsentProvider).
 *
 * A tiny inline script in the root layout sets window.__CL_CONSENT__ from the
 * cookie (or the geo default) BEFORE hydration, so analyticsAllowed() is correct
 * on first paint. Geo: EU/UK/EEA and California default to opt-in (analytics off
 * until accept); everywhere else defaults to opt-out (analytics on unless
 * rejected). California is opt-in because CIPA treats pre-consent third-party
 * analytics as a per-visit wiretap/pen-register liability.
 */

export const CONSENT_COOKIE = "cl_cookie_consent";
export const CONSENT_MAX_AGE_DAYS = 365;

export type Consent = {
  essential: 1;
  functional: 0 | 1;
  analytics: 0 | 1;
  marketing: 0 | 1;
};

export const DEFAULT_DENY: Consent = { essential: 1, functional: 0, analytics: 0, marketing: 0 };
export const DEFAULT_ALLOW: Consent = { essential: 1, functional: 1, analytics: 1, marketing: 0 };

// EU + EEA + UK (+ Switzerland) ISO-3166-1 alpha-2. These regions get opt-in.
export const OPT_IN_COUNTRIES = new Set<string>([
  "AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT",
  "LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE", // EU27
  "IS","LI","NO", // EEA
  "GB", "CH",     // UK + Switzerland
]);

// US states that get opt-in (default-deny), keyed by ISO-3166-2 subdivision
// code from x-vercel-ip-country-region. Only consulted when country === "US"
// (so it never collides with Canada's "CA" country code). California is here
// because CIPA's private right of action makes pre-consent analytics a
// per-visit liability. Add more states as their laws warrant.
export const OPT_IN_US_REGIONS = new Set<string>([
  "CA", // California -- CIPA / CPRA
]);

/** True when the visitor's geo requires opt-in (analytics off until accepted). */
export function isOptInGeo(
  country?: string | null,
  region?: string | null,
): boolean {
  if (country && OPT_IN_COUNTRIES.has(country)) return true;
  if (country === "US" && region && OPT_IN_US_REGIONS.has(region)) return true;
  return false;
}

export function parseConsent(str?: string | null): Consent {
  const c: Consent = { essential: 1, functional: 0, analytics: 0, marketing: 0 };
  if (str) {
    str.split("|").forEach((part) => {
      const [k, v] = part.split(":");
      if (k && k in c && k !== "essential") {
        (c as Record<string, 0 | 1>)[k] = parseInt(v, 10) ? 1 : 0;
      }
    });
  }
  c.essential = 1; // always on
  return c;
}

export function serializeConsent(c: Consent): string {
  return `essential:1|functional:${c.functional}|analytics:${c.analytics}|marketing:${c.marketing}`;
}

/** Default consent BEFORE the visitor chooses, based on region. */
export function defaultConsentForCountry(
  country: string | null | undefined,
  region?: string | null,
): Consent {
  return isOptInGeo(country, region) ? DEFAULT_DENY : DEFAULT_ALLOW;
}

export type ConsentWindow = {
  decided: boolean;
  functional: number;
  analytics: number;
  marketing: number;
};

declare global {
  interface Window {
    __CL_CONSENT__?: ConsentWindow;
  }
}

/** True only when analytics may run: not an admin/test browser AND analytics
 *  consent granted. Read by every analytics surface (PostHog, GA, the custom
 *  analytics, the song-play recorder). NOTE: the free-play ACCESS gate
 *  (PlayerContext.checkGate) must NOT use this -- it stays admin-only. */
export function analyticsAllowed(): boolean {
  if (typeof window === "undefined") return false; // SSR: resolve on the client
  try {
    if (localStorage.getItem("cl_skip_analytics") === "1") return false; // admin/test
  } catch {}
  const c = window.__CL_CONSENT__;
  return !!(c && c.analytics);
}

/* Consent changed under a surface that had already decided what to do about it.
 *
 * Most analytics call sites re-read analyticsAllowed() per event, so they pick a
 * new choice up on their own. Two do not: GoogleAnalytics decides in an effect
 * keyed on the pathname, and PostHog is initialised once at mount. Those two
 * used to be brought into line by reloading the whole page, which is a visible
 * blink and, on the homepage, rebooted the hero's animatic and took the scroll
 * with it. Subscribing is the same correction without the blink. */
export const CONSENT_CHANGE_EVENT = "cl-consent-change";

/** Fires whenever the choice changes. Returns its own unsubscribe. */
export function subscribeConsent(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
}

/** Persist the choice to the cookie + window bridge (client only). */
export function applyConsentClient(c: Consent): void {
  if (typeof document === "undefined") return;
  const d = new Date();
  d.setTime(d.getTime() + CONSENT_MAX_AGE_DAYS * 86400000);
  document.cookie =
    `${CONSENT_COOKIE}=${encodeURIComponent(serializeConsent(c))}` +
    `;expires=${d.toUTCString()};path=/;SameSite=Lax`;
  window.__CL_CONSENT__ = {
    decided: true,
    functional: c.functional,
    analytics: c.analytics,
    marketing: c.marketing,
  };
  // After the bridge is written, never before: a subscriber's first move is to
  // read analyticsAllowed(), and it has to see the new answer.
  window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
}

export function readConsentCookieClient(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(
    new RegExp("(?:^|; )" + CONSENT_COOKIE + "=([^;]*)"),
  );
  return m ? decodeURIComponent(m[1]) : null;
}

/** What the banner / cookie section render. chadlewine's real cookies + storage
 *  by category (audited 2026-05-30). */
export const COOKIE_REGISTRY = {
  essential: [
    { name: "sb-access-token / sb-refresh-token", desc: "Keeps you signed in", expiry: "1 hour / 30 days" },
    { name: "cf Turnstile token", desc: "Bot protection on forms", expiry: "Session" },
    { name: "chadlewine_cart (local)", desc: "Your shopping cart", expiry: "Until checkout" },
    { name: CONSENT_COOKIE, desc: "Remembers your cookie choices", expiry: "1 year" },
  ],
  analytics: [
    { name: "PostHog (ph_*)", desc: "Product analytics + session replay (first-party)", expiry: "1 year", thirdParty: "PostHog (US)" },
    { name: "_ga / _ga_*", desc: "Google Analytics usage stats", expiry: "2 years", thirdParty: "Google" },
    { name: "cl_sid (local) + device hash", desc: "First-party play counts + page metrics", expiry: "Session" },
  ],
} as const;
