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
// The same wait, asked for by a page that has no hero. The front door is one
// screen with no scroll and the bar is fixed to the bottom of it, so an
// undelayed bar is the first thing a first-time visitor meets. Whatever stamps
// this owns releasing it (see FrontConsentHold): a hold nothing lifts would
// mean a visitor in a deny-by-default region could never say yes.
const PAGE_HOLD = "cl-consent-hold";
const subscribeLock = (onChange: () => void) => {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => mo.disconnect();
};
const getLock = () => {
  const cl = document.documentElement.classList;
  return cl.contains(HERO_LOCK) || cl.contains(PAGE_HOLD);
};
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

  const applyLocal = useCallback((next: Consent) => {
    applyConsentClient(next);
    setDecided(true);
    setConsent(next);
    setManagerOpen(false);
    // NO RELOAD. This used to reload the page whenever analytics flipped, on the
    // grounds that GA and PostHog resolve at mount and an already-loaded tracker
    // cannot be unloaded in place. Both halves of that are now handled without
    // it, because the reload was a visible blink and, on the homepage, it booted
    // the hero's animatic from zero and took the scroll with it: accepting a
    // cookie choice from halfway down the page pinned the reader there for the
    // length of the intro.
    //
    // What enforces the choice instead, in place, both directions:
    //   - applyConsentClient now fires CONSENT_CHANGE_EVENT.
    //   - GoogleAnalytics re-runs its gate on that event. Granting loads gtag
    //     (and gtag('config') sends the first page_view itself); revoking sets
    //     window['ga-disable-<ID>'], gtag's documented kill switch, which is
    //     honoured on every hit and was already the mechanism admin exclusion
    //     relied on precisely BECAUSE unmounting the script cannot unload gtag.
    //   - PostHogProvider opts the already-initialised client in or out, which
    //     stops capture and session recording without a page load.
    // Every other analytics call site re-reads analyticsAllowed() per event and
    // needed nothing.
    //
    // The allowReload parameter went with the reload rather than being left as a
    // flag that no longer decides anything. If a reload is ever reintroduced,
    // the hazard it guarded is still real and worth knowing: the silent
    // cross-device reconcile below must never trigger one, because a route that
    // fails to persist the consent cookie (a cached 404 that strips Set-Cookie,
    // say) would reconcile, reload, and reconcile again forever.
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
            applyLocal(acct); // account is authoritative across devices
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
