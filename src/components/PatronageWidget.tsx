"use client";

import { useState } from "react";

interface PatronageWidgetProps {
  observationId?: string;
  observationTitle?: string;
}

const PRESETS = [500, 1000, 2500, 5000];

export function PatronageWidget({ observationId, observationTitle }: PatronageWidgetProps) {
  const [amount, setAmount] = useState(1000);
  const [custom, setCustom] = useState("");
  const [loading, setLoading] = useState(false);

  const effectiveAmount = custom ? Math.round(parseFloat(custom) * 100) : amount;

  async function handlePatronage() {
    if (effectiveAmount < 100 || loading) return;
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
      <h3 className="patronage__heading">Support This Work</h3>

      <div className="patronage__presets">
        {PRESETS.map((p) => (
          <button
            key={p}
            className={`patronage__preset${amount === p && !custom ? " patronage__preset--active" : ""}`}
            onClick={() => { setAmount(p); setCustom(""); }}
          >
            ${(p / 100).toFixed(0)}
          </button>
        ))}
      </div>

      <div className="patronage__custom">
        <span className="patronage__dollar">$</span>
        <input
          className="patronage__input"
          type="number"
          min="1"
          step="0.01"
          placeholder="Custom"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
        />
      </div>

      <button
        className="patronage__submit"
        onClick={handlePatronage}
        disabled={loading || effectiveAmount < 100}
      >
        {loading ? "Redirecting..." : `Give $${(effectiveAmount / 100).toFixed(2)}`}
      </button>
    </div>
  );
}
