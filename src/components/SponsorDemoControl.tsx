"use client";

import Link from "next/link";
import { useState } from "react";
import "./SponsorDemoControl.css";

const MIN_CHIP_IN = 5;

export function SponsorDemoControl({
  songId,
  songSlug,
  songTitle,
  productionType,
  productionMode,
  goalCents,
  raisedCents,
  backerCount,
  funded,
  accepting,
  earlyAccessNote,
}: {
  songId: string;
  songSlug: string;
  songTitle: string;
  productionType: "beat" | "full";
  productionMode: "remote" | "studio" | null;
  goalCents: number;
  raisedCents: number;
  backerCount: number;
  funded: boolean;
  accepting: boolean;
  earlyAccessNote: string | null;
}) {
  const remainingCents = Math.max(0, goalCents - raisedCents);
  const remainingDollars = Math.round(remainingCents / 100);
  const pct = goalCents > 0 ? Math.min(100, Math.round((raisedCents / goalCents) * 100)) : 0;

  const [amount, setAmount] = useState<number>(remainingDollars);
  const [creditName, setCreditName] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [requestNote, setRequestNote] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignin, setNeedsSignin] = useState(false);

  const signinHref = `/account/login?next=${encodeURIComponent(`/music/songs/${songSlug}`)}`;

  const tierTitle =
    productionType === "beat"
      ? "Sponsor the beat"
      : productionMode === "studio"
        ? "Fund the full studio production"
        : "Fund the full production";

  const isBuyout = amount >= remainingDollars;

  async function handleSponsor() {
    setError(null);
    if (!agreed) {
      setError("Please agree to the sponsorship terms.");
      return;
    }
    if (!amount || amount <= 0) {
      setError("Enter an amount.");
      return;
    }
    if (!isBuyout && amount < MIN_CHIP_IN) {
      setError(`Minimum contribution is $${MIN_CHIP_IN}.`);
      return;
    }
    setLoading(true);
    setNeedsSignin(false);
    try {
      const res = await fetch("/api/sponsor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          song_id: songId,
          amount,
          credit_name: creditName || undefined,
          is_anonymous: isAnonymous,
          request_note: productionType === "full" ? requestNote || undefined : undefined,
          agreed,
        }),
      });
      if (res.status === 401) {
        setNeedsSignin(true);
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not start checkout.");
        setLoading(false);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError("Could not start checkout.");
      setLoading(false);
    } catch {
      setError("Could not start checkout.");
      setLoading(false);
    }
  }

  return (
    <div className="sponsor-demo">
      <div className="sponsor-demo__head">
        <h3 className="sponsor-demo__tier">{tierTitle}</h3>
        <span className="sponsor-demo__badge">
          {productionType === "beat" ? "Beat" : "Full production"}
        </span>
      </div>

      <div className="sponsor-demo__bar">
        <div
          className={`sponsor-demo__bar-fill${funded ? " sponsor-demo__bar-fill--funded" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="sponsor-demo__stats">
        ${Math.round(raisedCents / 100).toLocaleString()} of ${Math.round(goalCents / 100).toLocaleString()} ({pct}%)
        {backerCount > 0 && ` - ${backerCount} ${backerCount === 1 ? "sponsor" : "sponsors"}`}
      </div>

      {earlyAccessNote && <p className="sponsor-demo__note">{earlyAccessNote}</p>}

      <p className="sponsor-demo__note">
        Sponsors get a production credit (no royalty) and early access to the finished track.
      </p>

      {funded ? (
        <p className="sponsor-demo__funded">
          Funded - this demo is on its way to production. Thank you.
        </p>
      ) : !accepting ? (
        <p className="sponsor-demo__note">
          Sponsorship for this demo is paused right now. Check back soon.
        </p>
      ) : (
        <>
          <div className="sponsor-demo__presets">
            <button
              type="button"
              className={`sponsor-demo__preset${isBuyout ? " sponsor-demo__preset--active" : ""}`}
              onClick={() => setAmount(remainingDollars)}
            >
              Fund it all (${remainingDollars.toLocaleString()})
            </button>
          </div>

          <div className="sponsor-demo__field">
            <label className="sponsor-demo__label" htmlFor="sponsor_amount">Amount ($)</label>
            <input
              id="sponsor_amount"
              className="sponsor-demo__input"
              type="number"
              min={MIN_CHIP_IN}
              max={remainingDollars}
              step={5}
              value={amount}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="sponsor-demo__field">
            <label className="sponsor-demo__label" htmlFor="sponsor_credit">How you&rsquo;d like to be credited (optional)</label>
            <input
              id="sponsor_credit"
              className="sponsor-demo__input"
              type="text"
              placeholder="Name for the production credit"
              maxLength={120}
              value={creditName}
              onChange={(e) => setCreditName(e.target.value)}
              disabled={isAnonymous}
            />
          </div>

          {productionType === "full" && (
            <div className="sponsor-demo__field">
              <label className="sponsor-demo__label" htmlFor="sponsor_request">Request a version (optional)</label>
              <textarea
                id="sponsor_request"
                className="sponsor-demo__textarea"
                rows={2}
                placeholder="e.g. acoustic version, deep house version"
                maxLength={480}
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
              />
            </div>
          )}

          <label className="sponsor-demo__check">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
            />
            <span>Keep my sponsorship anonymous</span>
          </label>

          <label className="sponsor-demo__check">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
            />
            <span>
              I understand contributions are non-refundable and are held toward this
              production, released only once the goal is met.
            </span>
          </label>

          {needsSignin && (
            <p className="sponsor-demo__note">
              <Link className="sponsor-demo__signin" href={signinHref}>Sign in</Link>{" "}
              to sponsor &ldquo;{songTitle}&rdquo; - your details are kept.
            </p>
          )}

          {error && <div className="sponsor-demo__msg sponsor-demo__msg--err">{error}</div>}

          <button
            type="button"
            className="sponsor-demo__submit"
            onClick={handleSponsor}
            disabled={loading || !agreed}
          >
            {loading
              ? "Redirecting..."
              : isBuyout
                ? `Sponsor it all - $${remainingDollars.toLocaleString()}`
                : `Chip in $${(amount || 0).toLocaleString()}`}
          </button>
        </>
      )}
    </div>
  );
}
