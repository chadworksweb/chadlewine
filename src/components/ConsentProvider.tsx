"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  type Consent,
  DEFAULT_DENY,
  applyConsentClient,
  serializeConsent,
} from "@/lib/consent";
import { ConsentBanner } from "@/components/ConsentBanner";

type ConsentCtx = {
  consent: Consent;
  decided: boolean;
  /** Open the manager (from the account page / privacy policy). */
  openManager: () => void;
  /** Persist a new choice (cookie + account + window bridge). */
  update: (c: Consent) => void;
};

const Ctx = createContext<ConsentCtx | null>(null);

// "A full-bleed hero still covers the top of the viewport", as an external
// store. Declared at module scope so subscribe and snapshot keep a stable
// identity across renders. The class is stamped by the hero before the first
// paint and cleared by the nav's scroll handler once the hero has left the
// viewport entirely, which is the same moment the site header comes back.
const HERO_LOCK = "ha-hero-top";
const subscribeLock = (onChange: () => void) => {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => mo.disconnect();
};
const getLock = () => document.documentElement.classList.contains(HERO_LOCK);
const getLockOnServer = () => false;

export function useConsent(): ConsentCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useConsent must be used within ConsentProvider");
  return c;
}

function fromWindow(): { decided: boolean; consent: Consent } {
  if (typeof window !== "undefined" && window.__CL_CONSENT__) {
    const w = window.__CL_CONSENT__;
    return {
      decided: !!w.decided,
      consent: {
        essential: 1,
        functional: w.functional ? 1 : 0,
        analytics: w.analytics ? 1 : 0,
        marketing: w.marketing ? 1 : 0,
      },
    };
  }
  return { decided: false, consent: DEFAULT_DENY };
}

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  // Stable SSR/first-paint values; real state resolves post-mount from the
  // window bridge (set by the inline bootstrap before hydration). This avoids
  // a hydration mismatch and any banner flash for returning visitors.
  const [mounted, setMounted] = useState(false);
  const [decided, setDecided] = useState(false);
  const [consent, setConsent] = useState<Consent>(DEFAULT_DENY);
  const [managerOpen, setManagerOpen] = useState(false);
  const reconciledRef = useRef(false);

  const applyLocal = useCallback((next: Consent, allowReload = true) => {
    const prevAnalytics = window.__CL_CONSENT__?.analytics ? 1 : 0;
    applyConsentClient(next);
    setDecided(true);
    setConsent(next);
    setManagerOpen(false);
    // Reload whenever analytics flips state so GA/PostHog cleanly load/unload
    // (they resolve at mount; flipping in place can't unload an already-loaded
    // tracker). Matches chadrising's reload-on-change behavior.
    //
    // Only an explicit user toggle (via update) may reload. The silent
    // cross-device reconcile passes allowReload=false: a route that never
    // persists the consent cookie (e.g. a Cloudflare-cached 404 that strips
    // Set-Cookie) would otherwise reconcile -> reload -> reconcile forever.
    // GA's ga-disable kill switch + PostHog opt-out enforce the reconciled
    // choice in place until the next navigation, so no reload is needed here.
    if (allowReload && next.analytics !== prevAnalytics) {
      window.setTimeout(() => window.location.reload(), 120);
    }
  }, []);

  const update = useCallback(
    (next: Consent) => {
      applyLocal(next);
      // Persist to the account if signed in (best effort; no-op for anon).
      fetch("/api/account/consent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          functional: !!next.functional,
          analytics: !!next.analytics,
          marketing: !!next.marketing,
        }),
      }).catch(() => {});
    },
    [applyLocal],
  );

  const openManager = useCallback(() => setManagerOpen(true), []);

  useEffect(() => {
    const cur = fromWindow();
    setDecided(cur.decided);
    setConsent(cur.consent);
    setMounted(true);
  }, []);

  // THE HERO GETS THE SCREEN TO ITSELF.
  // This bar is fixed to the bottom of the viewport and the homepage hero puts
  // its way into the page at the bottom of the frame, so the two land on top of
  // each other: measured on a 390x844 phone the bar is 197px tall and the
  // control sits at 740, and a hit test at its centre returned the cookie bar,
  // on desktop too. So the bar waits until the hero has been scrolled past
  // entirely, which is also when the site header comes back -- the page
  // furniture returns as one thing rather than a cookie bar arriving over an
  // animation. Nothing is skipped and nothing loads early: no answer still
  // means no analytics, the question is simply asked once you are in the page.
  //
  // Read off <html> rather than through context, because that class is written
  // from outside React entirely: a boot script before the first paint, and the
  // nav's scroll handler after. A class nothing in React owns IS an external
  // store, so it is read as one -- same reasoning as the hero's own
  // reduced-motion subscription, and it keeps the wait out of an effect that
  // would have to set state to report it.
  // This only ever WAITS. On any route without a full-bleed hero the class is
  // never there, the snapshot is false from the first render, and the bar
  // behaves exactly as it always has.
  const heldByHero = useSyncExternalStore(subscribeLock, getLock, getLockOnServer);

  // Reconcile with the account-backed choice once (cross-device).
  useEffect(() => {
    if (reconciledRef.current) return;
    reconciledRef.current = true;
    fetch("/api/account/consent")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || !d.authenticated) return;
        const local = fromWindow();
        if (d.consent) {
          const acct: Consent = {
            essential: 1,
            functional: d.consent.functional ? 1 : 0,
            analytics: d.consent.analytics ? 1 : 0,
            marketing: d.consent.marketing ? 1 : 0,
          };
          if (serializeConsent(acct) !== serializeConsent(local.consent) || !local.decided) {
            applyLocal(acct, false); // account is authoritative across devices; never reload from the silent reconcile
          }
        } else if (local.decided) {
          // Account has no stored choice yet; seed it from this device.
          fetch("/api/account/consent", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              functional: !!local.consent.functional,
              analytics: !!local.consent.analytics,
              marketing: !!local.consent.marketing,
            }),
          }).catch(() => {});
        }
      })
      .catch(() => {});
  }, [applyLocal]);

  return (
    <Ctx.Provider value={{ consent, decided, openManager, update }}>
      {children}
      {/* managerOpen is deliberately outside the hold: that one is a bar the
          visitor asked for from the account page or the privacy policy, so it
          opens when they ask for it, animatic or not. */}
      {mounted && ((!decided && !heldByHero) || managerOpen) && (
        <ConsentBanner
          initial={consent}
          forceManage={managerOpen}
          onSave={update}
          onClose={managerOpen ? () => setManagerOpen(false) : undefined}
        />
      )}
    </Ctx.Provider>
  );
}
