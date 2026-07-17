"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AUDIT_CALLOUT_MINUTES,
  AUDIT_MAX_MINUTES,
  auditBalanceCents,
  auditBilledMinutes,
  auditTotalCents,
  formatAuditCents,
} from "@/lib/audit-rate";

interface Props {
  id: string;
  status: string;
  startedAt: string | null;
  launchDiscount: boolean;
  holdCents: number;
  hasSavedCard: boolean;
}

function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

export function AuditSessionConsole({
  id,
  status,
  startedAt,
  launchDiscount,
  holdCents,
  hasSavedCard,
}: Props) {
  const router = useRouter();
  const [started, setStarted] = useState<string | null>(startedAt);
  const [now, setNow] = useState(() => Date.now());
  const [confirming, setConfirming] = useState(false);
  const [minutesInput, setMinutesInput] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const running = !!started && status !== "settled" && !confirming;

  useEffect(() => {
    if (!running) {
      if (tick.current) clearInterval(tick.current);
      return;
    }
    tick.current = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [running]);

  const elapsedSec = started ? (now - new Date(started).getTime()) / 1000 : 0;
  const liveMinutes = started
    ? auditBilledMinutes(new Date(started), new Date(now))
    : 0;

  async function handleStart() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/audit-sessions/${id}/start`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not start.");
        return;
      }
      setStarted(data.started_at);
      setNow(Date.now());
    } finally {
      setBusy(false);
    }
  }

  /** Stop does NOT charge. It opens the confirm with the timer's number
     pre-filled and editable. Charging straight off the timer means a session
     you forgot to stop bills the ceiling and the money is already gone. */
  function handleStop() {
    setMinutesInput(String(liveMinutes));
    setConfirming(true);
  }

  const confirmMinutes = Number(minutesInput);
  const confirmValid =
    Number.isFinite(confirmMinutes) &&
    confirmMinutes >= 0 &&
    confirmMinutes <= AUDIT_MAX_MINUTES;
  const confirmTotal = confirmValid
    ? auditTotalCents(confirmMinutes, launchDiscount)
    : 0;
  const confirmBalance = confirmValid
    ? auditBalanceCents(confirmMinutes, launchDiscount)
    : 0;
  const drifted = confirmValid && confirmMinutes !== liveMinutes;

  async function handleSettle() {
    if (!confirmValid || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/audit-sessions/${id}/settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billed_minutes: confirmMinutes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Settle failed.");
        return;
      }
      setResult(data.message || "Settled.");
      setConfirming(false);
      router.refresh();
    } catch {
      setError("Settle failed. Check Stripe before retrying.");
    } finally {
      setBusy(false);
    }
  }

  if (status === "settled") {
    return (
      <div className="audit-console audit-console--done">
        <p>Settled. Refund and re-charge in Stripe if something is wrong.</p>
      </div>
    );
  }

  return (
    <div className="audit-console">
      {!started && (
        <button
          type="button"
          className="audit-console__start"
          onClick={handleStart}
          disabled={busy}
        >
          {busy ? "Starting..." : "Start the clock"}
        </button>
      )}

      {started && !confirming && (
        <>
          <div className="audit-console__clock">
            <span className="audit-console__time">{clock(elapsedSec)}</span>
            <span className="audit-console__billing">
              billing {liveMinutes} min ={" "}
              {formatAuditCents(auditTotalCents(liveMinutes, launchDiscount))}
            </span>
          </div>

          <p className="audit-console__callouts">
            Call out at {AUDIT_CALLOUT_MINUTES.join(" and ")} minutes. The client
            is tracking their own time.
          </p>

          {liveMinutes >= AUDIT_MAX_MINUTES && (
            <p className="audit-console__ceiling">
              Ceiling hit. Billing stops at {AUDIT_MAX_MINUTES} minutes.
            </p>
          )}

          <button
            type="button"
            className="audit-console__stop"
            onClick={handleStop}
          >
            Stop and settle
          </button>
        </>
      )}

      {confirming && (
        <div className="audit-console__confirm">
          <h3>Charge now</h3>

          <label className="audit-console__minutes">
            Billed minutes
            <input
              type="number"
              min={0}
              max={AUDIT_MAX_MINUTES}
              value={minutesInput}
              onChange={(e) => setMinutesInput(e.target.value)}
            />
          </label>

          {drifted && (
            <p className="audit-console__drift">
              Timer said {liveMinutes}. You are charging {confirmMinutes}.
            </p>
          )}

          <dl className="audit-console__math">
            <div>
              <dt>Total ({confirmMinutes || 0} min)</dt>
              <dd>{formatAuditCents(confirmTotal)}</dd>
            </div>
            <div>
              <dt>Already held</dt>
              <dd>-{formatAuditCents(holdCents)}</dd>
            </div>
            <div className="audit-console__math-total">
              <dt>Charging now</dt>
              <dd>{formatAuditCents(confirmBalance)}</dd>
            </div>
          </dl>

          {!hasSavedCard && (
            <p className="audit-console__warn">
              No saved card. This will go out as a 24-hour invoice instead.
            </p>
          )}

          {confirmBalance === 0 && (
            <p className="audit-console__warn">
              Inside the 10 minutes already paid for. Nothing further is charged,
              and the hold is not refunded.
            </p>
          )}

          <div className="audit-console__actions">
            <button
              type="button"
              className="audit-console__cancel"
              onClick={() => setConfirming(false)}
              disabled={busy}
            >
              Back
            </button>
            <button
              type="button"
              className="audit-console__charge"
              onClick={handleSettle}
              disabled={!confirmValid || busy}
            >
              {busy
                ? "Charging..."
                : confirmBalance === 0
                  ? "Close out"
                  : `Charge ${formatAuditCents(confirmBalance)}`}
            </button>
          </div>
        </div>
      )}

      {result && <p className="audit-console__result">{result}</p>}
      {error && (
        <p className="audit-console__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
