/* Cookie-consent shared logic (anonymous cookie + account-backed).
 *
 * Source of truth at runtime is the `cl_cookie_consent` cookie
 * (essential:1|functional:X|analytics:X|marketing:X), readable on server and
 * client. For signed-in users the choice is also persisted on their audience
 * row and re-seeded into the cookie on login (see ConsentProvider).
 *
 * A tiny inline script in the root layout sets window.__CL_CONSENT__ from the
 * cookie (or the geo default) BEFORE hydration, so analyticsAllowed() is correct
 * on first paint. Geo: EU/UK/EEA default to opt-in (analytics off until accept);
 * everywhere else defaults to opt-out (analytics on unless rejected).
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
export function defaultConsentForCountry(country: string | null | undefined): Consent {
  return country && OPT_IN_COUNTRIES.has(country) ? DEFAULT_DENY : DEFAULT_ALLOW;
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
    { name: "Vercel Web Analytics", desc: "Aggregate page metrics (cookieless)", expiry: "None", thirdParty: "Vercel" },
    { name: "cl_sid (local) + device hash", desc: "First-party play counts + page metrics", expiry: "Session" },
  ],
} as const;
