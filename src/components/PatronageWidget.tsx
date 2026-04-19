"use client";

import { useEffect, useRef, useState } from "react";

interface PatronageWidgetProps {
  observationId?: string;
  observationTitle?: string;
}

const PRESETS = [5, 10, 25, 50];

export function PatronageWidget({ observationId, observationTitle }: PatronageWidgetProps) {
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

  async function handlePatronage() {
    if (effectiveAmount < 1 || loading || !agreed) return;
    setLoading(true);

    const res = await fetch("/api/patronage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: effectiveAmount,
        observation_id: observationId,
        observation_title: observationTitle,
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
        <h3 className="patronage__heading">Sponsor Chad Lewine</h3>
        <p className="patronage__subtitle">Make a one time patronage payment</p>

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
              </span>
            </span>{" "}
            of patronage
          </span>
        </label>

        <button
          className="patronage__submit"
          onClick={handlePatronage}
          disabled={loading || effectiveAmount < 1 || !agreed}
        >
          {loading ? "Redirecting..." : `Give $${Number(effectiveAmount).toFixed(2)}`}
        </button>
      </div>
    </div>
  );
}
