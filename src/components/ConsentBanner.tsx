"use client";

import { useState } from "react";
import Link from "next/link";
import type { Consent } from "@/lib/consent";
import "./ConsentBanner.css";

/* The cookie-consent bar (ported from chadrising's artist-world theme).
   Anonymous + logged-out and logged-in alike see this; ConsentProvider owns
   persistence (cookie + account). chadlewine has two real categories:
   Essential (always on) and Analytics (PostHog + Google Analytics +
   first-party). No advertising/marketing pixels, so no marketing toggle. */
export function ConsentBanner({
  initial,
  forceManage,
  onSave,
  onClose,
}: {
  initial: Consent;
  forceManage?: boolean;
  onSave: (c: Consent) => void;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(!!forceManage);
  const [analytics, setAnalytics] = useState(initial.analytics === 1);

  const acceptAll = () => onSave({ essential: 1, functional: 1, analytics: 1, marketing: 0 });
  const rejectOptional = () => onSave({ essential: 1, functional: 0, analytics: 0, marketing: 0 });
  const savePrefs = () =>
    onSave({
      essential: 1,
      functional: analytics ? 1 : 0,
      analytics: analytics ? 1 : 0,
      marketing: 0,
    });

  return (
    <div className="cl-consent" role="dialog" aria-label="Cookie preferences" aria-live="polite">
      <div className="cl-consent__bar">
        <span className="cl-consent__label" aria-hidden="true">{"░▒▓ cookies ▓▒░"}</span>
        <div className="cl-consent__text">
          We use cookies for essential site functions and (with your OK) analytics
          to understand how the site is used. <Link href="/privacy-policy">Learn more</Link>.
        </div>
        <div className="cl-consent__actions">
          <button type="button" className="cl-consent__btn cl-consent__btn--primary" onClick={acceptAll}>
            Accept all
          </button>
          <button type="button" className="cl-consent__btn cl-consent__btn--ghost" onClick={rejectOptional}>
            Reject optional
          </button>
          <button
            type="button"
            className="cl-consent__btn cl-consent__btn--ghost"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Close" : "Manage"}
          </button>
          {onClose && (
            <button
              type="button"
              className="cl-consent__btn cl-consent__btn--ghost"
              aria-label="Dismiss"
              onClick={onClose}
            >
              Done
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="cl-consent__details">
          <div className="cl-consent__category">
            <div className="cl-consent__cat-info">
              <div className="cl-consent__cat-name">Essential</div>
              <div className="cl-consent__cat-desc">
                Sign-in, shopping cart, bot protection, and your cookie choice. Always on.
              </div>
            </div>
            <span className="cl-consent__always">Always on</span>
          </div>

          <div className="cl-consent__category">
            <div className="cl-consent__cat-info">
              <div className="cl-consent__cat-name">Analytics</div>
              <div className="cl-consent__cat-desc">
                PostHog, Google Analytics, and first-party metrics (incl.
                session replay with inputs masked). Helps us improve the site.
              </div>
            </div>
            <label className="cl-consent__toggle">
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
                aria-label="Allow analytics"
              />
              <span className="cl-consent__slider" />
            </label>
          </div>

          <div className="cl-consent__save-row">
            <button type="button" className="cl-consent__btn cl-consent__btn--primary" onClick={savePrefs}>
              Save preferences
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
