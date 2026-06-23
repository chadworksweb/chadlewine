"use client";

import { useEffect, useRef, useState } from "react";

interface PatronageWidgetProps {
  observationId?: string;
  observationTitle?: string;
}

const PRESETS = [5, 10, 25, 50];

type Interval = "once" | "month";

export function PatronageWidget({ observationId, observationTitle }: PatronageWidgetProps) {
  const [interval, setInterval] = useState<Interval>("once");
  const [amount, setAmount] = useState(5);
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const termsRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!termsOpen) return;
    function onDocClick(e: MouseEvent) {
      if (termsRef.current && !termsRef.current.contains(e.target as Node)) {
        setTermsOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setTermsOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [termsOpen]);

  const effectiveAmount = custom ? parseFloat(custom) : amount;
  const monthly = interval === "month";

  async function handlePatronage() {
    if (effectiveAmount < 1 || loading || !agreed) return;
    setLoading(true);

    const res = await fetch("/api/patronage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: effectiveAmount,
        interval,
        // Monthly patronage backs the whole body of work, so it carries no
        // single-observation context; only the one-time gift does.
        ...(monthly ? {} : { observation_id: observationId, observation_title: observationTitle }),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    }
    setLoading(false);
  }

  return (
    <div className="patronage">
      <div className="patronage__inner">
        <div className="patronage__col patronage__col--intro">
          <h3 className="patronage__heading">Become a patron</h3>
          <p className="patronage__subtitle">
            One time or monthly, cancel anytime.
          </p>

          <div className="patronage__copy">
          <p>
            Patronage is the act or state of{" "}
            <strong>directly</strong>{" "}
            contributing to an artist&rsquo;s livelihood.
          </p>
          <p>
            Before streaming, labels, and the capitalization of art, the work got made
            because patrons believed it should exist. There are no perks and no tiers
            here. You are giving because you believe in me, my vision and my mission.
          </p>
          </div>
        </div>

        <div className="patronage__col patronage__col--form">
        <div className="patronage__toggle" role="tablist" aria-label="Patronage type">
          <button
            type="button"
            role="tab"
            aria-selected={!monthly}
            className={`patronage__toggle-opt${!monthly ? " patronage__toggle-opt--active" : ""}`}
            onClick={() => setInterval("once")}
          >
            One-time
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={monthly}
            className={`patronage__toggle-opt${monthly ? " patronage__toggle-opt--active" : ""}`}
            onClick={() => setInterval("month")}
          >
            Monthly
          </button>
        </div>

        <div className="patronage__amounts">
          {PRESETS.map((p) => (
            <button
              key={p}
              className={`patronage__preset${amount === p && !custom ? " patronage__preset--active" : ""}`}
              onClick={() => { setAmount(p); setCustom(""); }}
            >
              ${p}
            </button>
          ))}
          <div className="patronage__custom">
            <span className="patronage__dollar">$</span>
            <input
              className="patronage__input"
              type="number"
              min="1"
              step="1"
              placeholder="Custom"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
            />
            <div className="patronage__stepper">
              <button
                type="button"
                className="patronage__step"
                aria-label="Increase amount"
                onClick={() => setCustom(String(Math.max(1, Math.floor(parseFloat(custom) || 0) + 1)))}
              >
                &#9650;
              </button>
              <button
                type="button"
                className="patronage__step"
                aria-label="Decrease amount"
                onClick={() => setCustom(String(Math.max(1, Math.floor(parseFloat(custom) || 2) - 1)))}
              >
                &#9660;
              </button>
            </div>
          </div>
        </div>

        <label className="patronage__consent">
          <input
            type="checkbox"
            className="patronage__checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span className="patronage__consent-text">
            I agree to the{" "}
            <span
              ref={termsRef}
              className={`patronage__terms${termsOpen ? " patronage__terms--open" : ""}`}
            >
              <button
                type="button"
                className="patronage__terms-trigger"
                onClick={() => setTermsOpen((v) => !v)}
                onMouseEnter={() => setTermsOpen(true)}
                onMouseLeave={() => setTermsOpen(false)}
                aria-expanded={termsOpen}
                aria-haspopup="true"
              >
                terms
              </button>
              <span
                className="patronage__tooltip"
                role="tooltip"
                onMouseEnter={() => setTermsOpen(true)}
                onMouseLeave={() => setTermsOpen(false)}
              >
                Patronage is a voluntary, non-refundable gift. It does not entitle the patron to
                any goods, services, rights, or benefits, and creates no obligation on the part
                of Chad Lewine to provide anything in return.
                {monthly
                  ? " A monthly patronage renews automatically each month until you cancel, which you can do anytime."
                  : ""}
              </span>
            </span>{" "}
            of patronage
          </span>
        </label>

        <p className="patronage__summary">
          <span className="patronage__summary-amount">
            ${Number(effectiveAmount > 0 ? effectiveAmount : 0).toFixed(2)}
            {monthly ? " / month" : ""}
          </span>
          <span className="patronage__summary-note">
            {monthly ? "Renews monthly, cancel anytime" : "One-time patronage gift"}
          </span>
        </p>

        <button
          className="patronage__submit"
          onClick={handlePatronage}
          disabled={loading || effectiveAmount < 1 || !agreed}
        >
          {loading ? "Redirecting..." : "Support"}
        </button>
        </div>
      </div>
    </div>
  );
}
