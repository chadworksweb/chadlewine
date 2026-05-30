"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
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
    const prevAnalytics = window.__CL_CONSENT__?.analytics ? 1 : 0;
    applyConsentClient(next);
    setDecided(true);
    setConsent(next);
    setManagerOpen(false);
    // Reload whenever analytics flips state so GA/PostHog cleanly load/unload
    // (they resolve at mount; flipping in place can't unload an already-loaded
    // tracker). Matches chadrising's reload-on-change behavior.
    if (next.analytics !== prevAnalytics) {
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
      {mounted && (!decided || managerOpen) && (
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
